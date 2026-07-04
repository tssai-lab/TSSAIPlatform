package com.tss.platform.service;

import com.tss.platform.dto.DatasetWorkspaceSampleMutationDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class DatasetWorkspaceSampleMutationService {

    private static final String SAMPLE_NOT_FOUND =
            "dataset workspace sample not found or no permission";

    private final DatasetSampleRepository sampleRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final AuthContext authContext;
    private final DatasetWorkspaceAuditService auditService;

    @Autowired
    public DatasetWorkspaceSampleMutationService(
            DatasetSampleRepository sampleRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            AuthContext authContext,
            DatasetWorkspaceAuditService auditService
    ) {
        this.sampleRepo = sampleRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.authContext = authContext;
        this.auditService = auditService;
    }

    DatasetWorkspaceSampleMutationService(
            DatasetSampleRepository sampleRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            AuthContext authContext
    ) {
        this(sampleRepo, versionRepo, assetRepo, authContext, null);
    }

    @Transactional
    public DatasetWorkspaceSampleMutationDto deleteSample(String sampleId) {
        WorkspaceSampleContext context = requireMutableDraftSample(sampleId);
        DatasetSample sample = context.sample();
        if (!Boolean.TRUE.equals(sample.getDeleted())) {
            Instant now = Instant.now();
            sample.setDeleted(true);
            sample.setDeletedAt(now);
            sample.setUpdatedAt(now);
            sample = sampleRepo.saveAndFlush(sample);
            if (auditService != null) {
                auditService.recordSampleDeleted(
                        context.asset(),
                        context.version(),
                        sample
                );
            }
        }
        return toDto(sample);
    }

    @Transactional
    public DatasetWorkspaceSampleMutationDto restoreSample(String sampleId) {
        WorkspaceSampleContext context = requireMutableDraftSample(sampleId);
        DatasetSample sample = context.sample();
        if (Boolean.TRUE.equals(sample.getDeleted())) {
            sample.setDeleted(false);
            sample.setDeletedAt(null);
            sample.setUpdatedAt(Instant.now());
            sample = sampleRepo.saveAndFlush(sample);
            if (auditService != null) {
                auditService.recordSampleRestored(
                        context.asset(),
                        context.version(),
                        sample
                );
            }
        }
        return toDto(sample);
    }

    private WorkspaceSampleContext requireMutableDraftSample(String sampleId) {
        if (sampleId == null || sampleId.isBlank()) {
            throw new IllegalArgumentException(SAMPLE_NOT_FOUND);
        }
        DatasetSample sample = sampleRepo.findByIdForUpdate(sampleId)
                .orElseThrow(() -> new IllegalArgumentException(SAMPLE_NOT_FOUND));
        DatasetVersion version = versionRepo
                .findByIdAndDeletedFalse(sample.getDatasetVersionId())
                .orElseThrow(() -> new IllegalArgumentException(SAMPLE_NOT_FOUND));
        if (!"DRAFT".equals(version.getStatus())) {
            throw new IllegalArgumentException(SAMPLE_NOT_FOUND);
        }
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException(SAMPLE_NOT_FOUND));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new IllegalArgumentException(SAMPLE_NOT_FOUND);
        }
        return new WorkspaceSampleContext(sample, version, asset);
    }

    private static DatasetWorkspaceSampleMutationDto toDto(DatasetSample sample) {
        DatasetWorkspaceSampleMutationDto dto =
                new DatasetWorkspaceSampleMutationDto();
        dto.setSampleId(sample.getId());
        dto.setDatasetVersionId(sample.getDatasetVersionId());
        dto.setDeleted(Boolean.TRUE.equals(sample.getDeleted()));
        dto.setDeletedAt(sample.getDeletedAt());
        return dto;
    }

    private record WorkspaceSampleContext(
            DatasetSample sample,
            DatasetVersion version,
            DatasetAsset asset
    ) {
    }
}
