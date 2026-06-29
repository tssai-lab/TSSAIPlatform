package com.tss.platform.service;

import com.tss.platform.dto.DatasetWorkspaceDraftDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class DatasetWorkspaceService {

    private static final String DRAFT = "DRAFT";
    private static final String NOT_FOUND = "dataset version not found or no permission";

    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final AuthContext authContext;
    private final DatasetVersionLifecycleService lifecycleService;
    private final DatasetWorkspaceMaterializer materializer;

    public DatasetWorkspaceService(
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            AuthContext authContext,
            DatasetVersionLifecycleService lifecycleService,
            DatasetWorkspaceMaterializer materializer
    ) {
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.authContext = authContext;
        this.lifecycleService = lifecycleService;
        this.materializer = materializer;
    }

    @Transactional
    public DatasetWorkspaceDraftDto createDraft(String readyVersionId) {
        if (readyVersionId == null || readyVersionId.isBlank()) {
            throw new IllegalArgumentException(NOT_FOUND);
        }

        DatasetVersion parent = versionRepo
                .findByIdAndDeletedFalseForUpdate(readyVersionId)
                .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));
        DatasetAsset asset = assetRepo
                .findByIdAndDeletedFalseForUpdate(parent.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new IllegalArgumentException(NOT_FOUND);
        }
        lifecycleService.assertReadyVersion(parent);

        Optional<DatasetVersion> activeDraft =
                versionRepo.findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                        asset.getId(),
                        DRAFT
                );
        if (activeDraft.isPresent()) {
            throw new IllegalArgumentException(
                    "dataset asset already has an active DRAFT version: "
                            + activeDraft.get().getId()
            );
        }

        int versionNo = nextVersionNo(asset.getId());
        String versionLabel = "v" + versionNo;
        Instant now = Instant.now();
        DatasetVersion draft = new DatasetVersion();
        draft.setId("dataset-ver-" + UUID.randomUUID().toString().replace("-", ""));
        draft.setAssetId(asset.getId());
        draft.setVersion(versionLabel);
        draft.setVersionNo(versionNo);
        draft.setVersionLabel(versionLabel);
        draft.setFileName(parent.getFileName());
        draft.setStoragePath(parent.getStoragePath());
        draft.setSizeBytes(parent.getSizeBytes());
        draft.setCvTaskType(parent.getCvTaskType());
        draft.setAnnotationFormat(parent.getAnnotationFormat());
        draft.setRemark("Workspace draft based on " + parent.getId());
        draft.setDescription(parent.getDescription());
        draft.setChangeLog("Workspace draft created from " + parent.getId());
        draft.setParentVersionId(parent.getId());
        draft.setStatus(DRAFT);
        draft.setFileFingerprint(parent.getFileFingerprint());
        draft.setPublishedAt(null);
        draft.setCreatedBy(authContext.currentUserId());
        draft.setOwnerUserId(asset.getOwnerUserId());
        draft.setCreatedAt(now);
        draft.setDeleted(false);
        draft.setDeletedAt(null);
        DatasetVersion saved = versionRepo.save(draft);
        materializer.materialize(asset, parent, saved);

        DatasetWorkspaceDraftDto dto = new DatasetWorkspaceDraftDto();
        dto.setDraftVersionId(saved.getId());
        dto.setParentVersionId(parent.getId());
        dto.setDatasetAssetId(asset.getId());
        dto.setVersionNo(saved.getVersionNo());
        dto.setStatus(saved.getStatus());
        dto.setCurrentVersionId(asset.getCurrentVersionId());
        dto.setMessage("workspace draft created");
        return dto;
    }

    private int nextVersionNo(String assetId) {
        Integer maxVersionNo = versionRepo.findMaxVersionNoByAssetId(assetId);
        int candidate = (maxVersionNo == null ? 0 : maxVersionNo) + 1;
        while (versionRepo.existsByAssetIdAndVersion(assetId, "v" + candidate)) {
            candidate += 1;
        }
        return candidate;
    }
}
