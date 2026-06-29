package com.tss.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.DatasetWorkspaceDraftDto;
import com.tss.platform.dto.DatasetWorkspacePublishDto;
import com.tss.platform.dto.v2.V2DatasetEditSessionDto;
import com.tss.platform.dto.v2.V2DatasetPublishResult;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.dto.v2.V2UserError;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class V2DatasetEditService {

    private static final String DRAFT = "DRAFT";
    private static final String APPEND_PACKAGE = "APPEND_PACKAGE";
    private static final Set<String> IMPORTING = Set.of("PENDING", "RUNNING");

    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetUploadSessionRepository uploadSessionRepo;
    private final ImportJobRepository importJobRepo;
    private final DatasetSampleRepository sampleRepo;
    private final AuthContext authContext;
    private final DatasetWorkspaceService workspaceService;
    private final DatasetWorkspacePublishService publishService;
    private final V2DatasetUploadService uploadService;
    private final ObjectMapper objectMapper;

    public V2DatasetEditService(
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            DatasetUploadSessionRepository uploadSessionRepo,
            ImportJobRepository importJobRepo,
            DatasetSampleRepository sampleRepo,
            AuthContext authContext,
            DatasetWorkspaceService workspaceService,
            DatasetWorkspacePublishService publishService,
            V2DatasetUploadService uploadService,
            ObjectMapper objectMapper
    ) {
        this.assetRepo = assetRepo;
        this.versionRepo = versionRepo;
        this.uploadSessionRepo = uploadSessionRepo;
        this.importJobRepo = importJobRepo;
        this.sampleRepo = sampleRepo;
        this.authContext = authContext;
        this.workspaceService = workspaceService;
        this.publishService = publishService;
        this.uploadService = uploadService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public V2DatasetEditSessionDto createEditSession(String datasetId) {
        DatasetAsset asset = requireOwnedAsset(datasetId);
        Optional<DatasetVersion> activeDraft =
                versionRepo.findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                        asset.getId(),
                        DRAFT
                );
        String draftId;
        if (activeDraft.isPresent()) {
            draftId = activeDraft.get().getId();
        } else {
            if (asset.getCurrentVersionId() == null
                    || asset.getCurrentVersionId().isBlank()) {
                throw new V2BusinessException(
                        HttpStatus.CONFLICT,
                        "DATASET_NOT_EDITABLE",
                        "数据集当前没有可编辑的已发布版本"
                );
            }
            DatasetWorkspaceDraftDto created;
            try {
                created = workspaceService.createDraft(asset.getCurrentVersionId());
            } catch (IllegalArgumentException exception) {
                if (exception.getMessage() != null
                        && exception.getMessage().startsWith(
                                "dataset asset already has an active DRAFT version:"
                        )) {
                    throw new V2BusinessException(
                            HttpStatus.CONFLICT,
                            "ACTIVE_DRAFT_EXISTS",
                            "数据集已有编辑中的草稿"
                    );
                }
                throw new V2BusinessException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "DATASET_NOT_EDITABLE",
                        "数据集当前无法创建编辑会话"
                );
            }
            draftId = created.getDraftVersionId();
        }
        return getEditSession(draftId);
    }

    @Transactional(readOnly = true)
    public V2DatasetEditSessionDto getEditSession(String editSessionId) {
        DatasetVersion draft = requireOwnedDraft(editSessionId);
        DatasetAsset asset = requireOwnedAsset(draft.getAssetId());
        DatasetUploadSession latestUpload = uploadSessionRepo
                .findFirstByVersionIdAndUploadPurposeOrderByCreatedAtDesc(
                        draft.getId(),
                        APPEND_PACKAGE
                )
                .orElse(null);
        List<ImportJob> importJobs =
                importJobRepo.findByDatasetVersionId(draft.getId());
        ImportJob latestJob = latestImportJob(importJobs);
        long sampleCount =
                sampleRepo.countByDatasetVersionIdAndDeletedFalse(draft.getId());
        boolean canPublish = sampleCount > 0
                && importJobs.stream()
                        .allMatch(job -> "SUCCESS".equals(job.getStatus()));

        List<String> actions = new ArrayList<>();
        actions.add("VIEW");
        if ("MULTIMODAL".equals(asset.getType())) {
            actions.add("ADD_DATA");
        }
        if (canPublish) {
            actions.add("PUBLISH");
        }

        V2DatasetEditSessionDto dto = new V2DatasetEditSessionDto();
        dto.setEditSessionId(draft.getId());
        dto.setDatasetId(asset.getId());
        dto.setVersionLabel(displayVersion(draft));
        dto.setDisplayStatus(editDisplayStatus(latestJob));
        dto.setLatestUpload(latestUpload == null ? null : toUpload(latestUpload));
        dto.setImportProgress(latestJob == null ? null : latestJob.getProgress());
        dto.setSampleCount(sampleCount);
        dto.setCanPublish(canPublish);
        dto.setAvailableActions(List.copyOf(actions));
        dto.setUserError(userError(latestJob));
        return dto;
    }

    public V2DatasetUploadDto initUpload(
            String editSessionId,
            DatasetPackageAppendInitRequest request
    ) {
        requireOwnedDraft(editSessionId);
        return uploadService.initAppend(editSessionId, request);
    }

    public V2DatasetPublishResult publish(String editSessionId) {
        requireOwnedDraft(editSessionId);
        DatasetWorkspacePublishDto published;
        try {
            published = publishService.publish(editSessionId);
        } catch (IllegalArgumentException exception) {
            throw new V2BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "DATASET_NOT_PUBLISHABLE",
                    "数据集尚不满足发布条件"
            );
        }
        V2DatasetPublishResult result = new V2DatasetPublishResult();
        result.setDatasetId(published.getDatasetAssetId());
        result.setCurrentVersion(
                published.getVersionNo() == null ? null : "v" + published.getVersionNo()
        );
        result.setStatus(published.getStatus());
        result.setPublishedAt(published.getPublishedAt());
        return result;
    }

    private DatasetAsset requireOwnedAsset(String datasetId) {
        if (datasetId == null || datasetId.isBlank()) {
            throw notFound();
        }
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(datasetId)
                .orElseThrow(this::notFound);
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw notFound();
        }
        return asset;
    }

    private DatasetVersion requireOwnedDraft(String editSessionId) {
        if (editSessionId == null || editSessionId.isBlank()) {
            throw notFound();
        }
        DatasetVersion draft = versionRepo.findByIdAndDeletedFalse(editSessionId)
                .orElseThrow(this::notFound);
        if (!DRAFT.equals(draft.getStatus())) {
            throw notFound();
        }
        requireOwnedAsset(draft.getAssetId());
        return draft;
    }

    private ImportJob latestImportJob(List<ImportJob> importJobs) {
        return importJobs.stream()
                .max(Comparator
                        .comparing(
                                ImportJob::getCreatedAt,
                                Comparator.nullsFirst(Comparator.naturalOrder())
                        )
                        .thenComparing(
                                ImportJob::getId,
                                Comparator.nullsFirst(Comparator.naturalOrder())
                        ))
                .orElse(null);
    }

    private V2DatasetUploadDto toUpload(DatasetUploadSession source) {
        V2DatasetUploadDto dto = new V2DatasetUploadDto();
        dto.setUploadId(source.getId());
        dto.setStatus(source.getStatus());
        dto.setFileName(source.getFileName());
        dto.setFileSize(source.getFileSize());
        dto.setChunkSize(source.getChunkSize());
        dto.setTotalChunks(source.getTotalChunks());
        dto.setCreatedAt(source.getCreatedAt());
        dto.setUpdatedAt(source.getUpdatedAt());
        return dto;
    }

    private String editDisplayStatus(ImportJob job) {
        if (job != null && "FAILED".equals(job.getStatus())) {
            return "IMPORT_FAILED";
        }
        if (job != null && IMPORTING.contains(job.getStatus())) {
            return "IMPORTING";
        }
        return "EDITING";
    }

    private V2UserError userError(ImportJob job) {
        if (job == null || !"FAILED".equals(job.getStatus())) {
            return null;
        }
        return new V2UserError(
                job.getErrorCode() == null ? "IMPORT_FAILED" : job.getErrorCode(),
                job.getErrorMessage() == null
                        ? "数据导入失败，请检查上传内容后重试"
                        : job.getErrorMessage(),
                parseDetails(job.getErrorDetailsJson())
        );
    }

    private Map<String, Object> parseDetails(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return Map.copyOf(objectMapper.readValue(
                    json,
                    new TypeReference<LinkedHashMap<String, Object>>() {
                    }
            ));
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private String displayVersion(DatasetVersion version) {
        return version.getVersionLabel() != null && !version.getVersionLabel().isBlank()
                ? version.getVersionLabel()
                : version.getVersion();
    }

    private V2BusinessException notFound() {
        return new V2BusinessException(
                HttpStatus.NOT_FOUND,
                "DATASET_NOT_FOUND",
                "数据集不存在或无权访问"
        );
    }
}
