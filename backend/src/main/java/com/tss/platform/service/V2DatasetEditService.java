package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.controller.v2.V2ErrorDetailsSanitizer;
import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.DatasetWorkspaceDraftDto;
import com.tss.platform.dto.DatasetWorkspacePublishDto;
import com.tss.platform.dto.DatasetPackageCleanupPlanDto;
import com.tss.platform.dto.v2.V2DatasetDiscardResult;
import com.tss.platform.dto.v2.V2DatasetEditSessionDto;
import com.tss.platform.dto.v2.V2DatasetPublishResult;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetPackage;
import com.tss.platform.entity.DatasetUploadChunk;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetPackageRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadChunkRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionPackageRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class V2DatasetEditService {

    private static final Logger log = LoggerFactory.getLogger(V2DatasetEditService.class);

    private static final String DRAFT = "DRAFT";
    private static final String APPEND_PACKAGE = "APPEND_PACKAGE";
    private static final String IMPORT_SUPERSEDED = "SUPERSEDED";
    private static final String UPLOAD_DISCARDED = "DISCARDED";
    private static final String PACKAGE_SUPERSEDED = "SUPERSEDED";
    private static final String DISCARD_ERROR_CODE = "DRAFT_DISCARDED";

    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetUploadSessionRepository uploadSessionRepo;
    private final ImportJobRepository importJobRepo;
    private final DatasetVersionPackageRepository versionPackageRepo;
    private final DatasetPackageRepository packageRepo;
    private final DatasetUploadChunkRepository uploadChunkRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetPackageCleanupPlannerService cleanupPlanner;
    private final MinioDeleteTaskService deleteTaskService;
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
            DatasetVersionPackageRepository versionPackageRepo,
            DatasetPackageRepository packageRepo,
            DatasetUploadChunkRepository uploadChunkRepo,
            DatasetSampleRepository sampleRepo,
            DatasetPackageCleanupPlannerService cleanupPlanner,
            MinioDeleteTaskService deleteTaskService,
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
        this.versionPackageRepo = versionPackageRepo;
        this.packageRepo = packageRepo;
        this.uploadChunkRepo = uploadChunkRepo;
        this.sampleRepo = sampleRepo;
        this.cleanupPlanner = cleanupPlanner;
        this.deleteTaskService = deleteTaskService;
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
        ImportJob statusJob = V2ImportJobStatusSelector.statusJobOf(importJobs);
        long sampleCount =
                sampleRepo.countByDatasetVersionIdAndDeletedFalse(draft.getId());
        boolean canPublish = sampleCount > 0
                && importJobs.stream()
                        .allMatch(job -> V2ImportJobDisplayHelper.isPublishTerminalJobStatus(job.getStatus()));

        List<String> actions = new ArrayList<>();
        actions.add("VIEW");
        actions.add("ADD_DATA");
        if (canPublish) {
            actions.add("PUBLISH");
        }

        V2DatasetEditSessionDto dto = new V2DatasetEditSessionDto();
        dto.setEditSessionId(draft.getId());
        dto.setDatasetId(asset.getId());
        dto.setImportJobId(statusJob == null ? null : statusJob.getId());
        dto.setVersionLabel(V2ImportJobDisplayHelper.displayVersion(draft));
        dto.setDisplayStatus(V2ImportJobDisplayHelper.editSessionDisplayStatus(statusJob));
        dto.setLatestUpload(latestUpload == null ? null : toUpload(latestUpload));
        dto.setImportProgress(statusJob == null ? null : statusJob.getProgress());
        dto.setSampleCount(sampleCount);
        dto.setCanPublish(canPublish);
        dto.setAvailableActions(List.copyOf(actions));
        dto.setUserError(V2ImportJobDisplayHelper.userError(statusJob, objectMapper));
        return dto;
    }

    public V2DatasetUploadDto initUpload(
            String editSessionId,
            DatasetPackageAppendInitRequest request
    ) {
        requireOwnedDraft(editSessionId);
        return uploadService.initAppend(editSessionId, request);
    }

    @Transactional
    public V2DatasetDiscardResult discard(String editSessionId) {
        DraftAccess access = requireOwnedDraftForDiscard(editSessionId);
        DatasetVersion draft = access.draft();
        DatasetAsset asset = access.asset();
        if (Boolean.TRUE.equals(draft.getDeleted())) {
            log.info(
                    "V2 dataset discard idempotent replay: datasetId={}, versionId={}, status={}",
                    asset.getId(),
                    draft.getId(),
                    UPLOAD_DISCARDED
            );
            return toDiscardResult(draft, asset, discardedAt(draft));
        }
        Instant now = Instant.now();

        List<DatasetUploadSession> uploadSessions =
                uploadSessionRepo.findByVersionIdForUpdate(draft.getId());
        List<ImportJob> importJobs = importJobRepo.findByDatasetVersionId(draft.getId());
        List<DatasetVersionPackage> packageRelations =
                versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(
                        draft.getId()
                );

        List<ChunkCleanup> chunkCleanups = discardUploadSessions(uploadSessions, now);
        supersedeImportJobs(importJobs, now);
        draft.setDeleted(true);
        draft.setDeletedAt(now);
        versionRepo.saveAndFlush(draft);

        LinkedHashSet<String> packageIds = packageIds(packageRelations);
        if (!packageRelations.isEmpty()) {
            versionPackageRepo.deleteAll(packageRelations);
            versionPackageRepo.flush();
        }
        cleanupPackages(packageIds, now);
        registerChunkCleanup(chunkCleanups);

        log.info(
                "V2 dataset discard completed: datasetId={}, versionId={}, uploadSessionCount={}, importJobCount={}, packageCount={}, chunkCleanupCount={}, status={}",
                asset.getId(),
                draft.getId(),
                uploadSessions.size(),
                importJobs.size(),
                packageIds.size(),
                chunkCleanups.size(),
                UPLOAD_DISCARDED
        );
        return toDiscardResult(draft, asset, now);
    }

    private V2DatasetDiscardResult toDiscardResult(
            DatasetVersion draft,
            DatasetAsset asset,
            Instant discardedAt
    ) {
        V2DatasetDiscardResult result = new V2DatasetDiscardResult();
        result.setEditSessionId(draft.getId());
        result.setDatasetId(asset.getId());
        result.setStatus(UPLOAD_DISCARDED);
        result.setDiscardedAt(discardedAt);
        return result;
    }

    private Instant discardedAt(DatasetVersion draft) {
        return draft.getDeletedAt() == null ? Instant.now() : draft.getDeletedAt();
    }

    @Transactional
    public V2DatasetPublishResult publish(String editSessionId) {
        requireOwnedDraft(editSessionId);
        DatasetWorkspacePublishDto published;
        try {
            published = publishService.publish(editSessionId);
        } catch (IllegalArgumentException exception) {
            throw mapPublishFailure(exception);
        }
        V2DatasetPublishResult result = new V2DatasetPublishResult();
        result.setDatasetId(published.getDatasetAssetId());
        result.setCurrentVersion(
                published.getVersionNo() == null ? null : "v" + published.getVersionNo()
        );
        result.setStatus(published.getStatus());
        result.setPublishedAt(published.getPublishedAt());
        log.info(
                "V2 dataset publish completed: datasetId={}, editSessionId={}, versionId={}, status={}",
                published.getDatasetAssetId(),
                editSessionId,
                published.getDatasetVersionId(),
                published.getStatus()
        );
        return result;
    }

    private List<ChunkCleanup> discardUploadSessions(
            List<DatasetUploadSession> uploadSessions,
            Instant now
    ) {
        List<ChunkCleanup> chunkCleanups = new ArrayList<>();
        for (DatasetUploadSession session : uploadSessions) {
            if (session == null) {
                continue;
            }
            List<DatasetUploadChunk> chunks =
                    uploadChunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
            for (DatasetUploadChunk chunk : chunks) {
                if (chunk.getObjectName() != null && !chunk.getObjectName().isBlank()) {
                    chunkCleanups.add(new ChunkCleanup(
                            chunk.getId(),
                            session.getId(),
                            chunk.getObjectName(),
                            session.getOwnerUserId()
                    ));
                }
            }
            session.setStatus(UPLOAD_DISCARDED);
            session.setUpdatedAt(now);
            uploadSessionRepo.save(session);
        }
        return chunkCleanups;
    }

    private void supersedeImportJobs(List<ImportJob> importJobs, Instant now) {
        for (ImportJob job : importJobs) {
            if (job == null || IMPORT_SUPERSEDED.equals(job.getStatus())) {
                continue;
            }
            job.setStatus(IMPORT_SUPERSEDED);
            job.setProgress(job.getProgress() == null ? 0 : job.getProgress());
            job.setErrorCode(DISCARD_ERROR_CODE);
            job.setErrorMessage("数据集编辑草稿已放弃");
            job.setErrorDetailsJson(null);
            job.setExecutorId(null);
            job.setHeartbeatAt(null);
            job.setUpdatedAt(now);
            if (job.getFinishedAt() == null) {
                job.setFinishedAt(now);
            }
            importJobRepo.save(job);
        }
    }

    private LinkedHashSet<String> packageIds(
            List<DatasetVersionPackage> packageRelations
    ) {
        LinkedHashSet<String> packageIds = new LinkedHashSet<>();
        for (DatasetVersionPackage relation : packageRelations) {
            if (relation == null
                    || relation.getPackageId() == null
                    || relation.getPackageId().isBlank()) {
                continue;
            }
            packageIds.add(relation.getPackageId());
        }
        return packageIds;
    }

    private void cleanupPackages(LinkedHashSet<String> packageIds, Instant now) {
        for (String packageId : packageIds) {
            DatasetPackageCleanupPlanDto plan = cleanupPlanner.enqueueIfSafe(packageId);
            if (plan == null || !plan.isCanDelete()) {
                continue;
            }
            DatasetPackage datasetPackage = packageRepo
                    .findByIdAndDeletedFalse(packageId)
                    .orElse(null);
            if (datasetPackage == null) {
                continue;
            }
            datasetPackage.setStatus(PACKAGE_SUPERSEDED);
            datasetPackage.setDeleted(true);
            datasetPackage.setDeletedAt(now);
            packageRepo.save(datasetPackage);
            log.info(
                    "V2 dataset discard package cleanup completed: packageId={}, status={}",
                    packageId,
                    PACKAGE_SUPERSEDED
            );
        }
    }

    private void registerChunkCleanup(List<ChunkCleanup> chunkCleanups) {
        if (chunkCleanups.isEmpty()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            cleanupChunks(chunkCleanups);
                        }
                    }
            );
            return;
        }
        cleanupChunks(chunkCleanups);
    }

    private void cleanupChunks(List<ChunkCleanup> chunkCleanups) {
        LinkedHashSet<String> uploadIds = new LinkedHashSet<>();
        int enqueued = 0;
        int metadataDeleted = 0;
        for (ChunkCleanup cleanup : chunkCleanups) {
            uploadIds.add(cleanup.uploadId());
            try {
                deleteTaskService.enqueueDefaultBucketDeleteImmediately(
                        cleanup.objectName(),
                        MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_CHUNK,
                        cleanup.uploadId(),
                        cleanup.ownerUserId()
                );
                enqueued += 1;
            } catch (Exception exception) {
                log.warn(
                        "V2 dataset discard chunk cleanup enqueue failed: uploadId={}, exceptionType={}",
                        cleanup.uploadId(),
                        exception.getClass().getSimpleName()
                );
                continue;
            }
            try {
                uploadChunkRepo.deleteByIdImmediately(cleanup.chunkId());
                metadataDeleted += 1;
            } catch (Exception exception) {
                log.warn(
                        "V2 dataset discard chunk metadata cleanup failed: uploadId={}, exceptionType={}",
                        cleanup.uploadId(),
                        exception.getClass().getSimpleName()
                );
            }
        }
        log.info(
                "V2 dataset discard chunk cleanup processed: uploadIdCount={}, chunkCleanupCount={}, enqueuedCount={}, metadataDeletedCount={}",
                uploadIds.size(),
                chunkCleanups.size(),
                enqueued,
                metadataDeleted
        );
    }

    private V2BusinessException mapPublishFailure(IllegalArgumentException exception) {
        if (isDraftUnavailableForPublish(exception)) {
            return new V2BusinessException(
                    HttpStatus.NOT_FOUND,
                    "DATASET_NOT_FOUND",
                    "数据集编辑会话不存在或无权访问",
                    reasonDetails(exception)
            );
        }
        return new V2BusinessException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "DATASET_NOT_PUBLISHABLE",
                "数据集尚不满足发布条件",
                reasonDetails(exception)
        );
    }

    private boolean isDraftUnavailableForPublish(IllegalArgumentException exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) {
            return false;
        }
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("not found or no permission")
                || normalized.startsWith("dataset workspace version not found")
                || normalized.startsWith("dataset version must be draft");
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

    private V2DatasetUploadDto toUpload(DatasetUploadSession source) {
        V2DatasetUploadDto dto = new V2DatasetUploadDto();
        dto.setUploadId(source.getId());
        dto.setImportJobId(source.getImportJobId());
        dto.setStatus(source.getStatus());
        dto.setFileName(source.getFileName());
        dto.setFileSize(source.getFileSize());
        dto.setChunkSize(source.getChunkSize());
        dto.setTotalChunks(source.getTotalChunks());
        dto.setStrictManifest(Boolean.TRUE.equals(source.getStrictManifest()));
        dto.setCreatedAt(source.getCreatedAt());
        dto.setUpdatedAt(source.getUpdatedAt());
        return dto;
    }

    private Map<String, Object> reasonDetails(IllegalArgumentException exception) {
        return V2ErrorDetailsSanitizer.reasonDetails(
                exception,
                "数据集操作暂时无法完成，请稍后重试"
        );
    }

    private V2BusinessException notFound() {
        return new V2BusinessException(
                HttpStatus.NOT_FOUND,
                "DATASET_NOT_FOUND",
                "数据集不存在或无权访问"
        );
    }

    private DraftAccess requireOwnedDraftForUpdate(String editSessionId) {
        if (editSessionId == null || editSessionId.isBlank()) {
            throw notFound();
        }
        DatasetVersion draft = versionRepo.findByIdAndDeletedFalseForUpdate(editSessionId)
                .orElseThrow(this::notFound);
        return requireOwnedDraftAccess(draft);
    }

    private DraftAccess requireOwnedDraftForDiscard(String editSessionId) {
        if (editSessionId == null || editSessionId.isBlank()) {
            throw notFound();
        }
        Optional<DatasetVersion> activeDraft =
                versionRepo.findByIdAndDeletedFalseForUpdate(editSessionId);
        if (activeDraft.isPresent()) {
            return requireOwnedDraftAccess(activeDraft.get());
        }
        DatasetVersion draft = versionRepo.findById(editSessionId)
                .orElseThrow(this::notFound);
        if (!Boolean.TRUE.equals(draft.getDeleted())) {
            throw notFound();
        }
        return requireOwnedDraftAccess(draft);
    }

    private DraftAccess requireOwnedDraftAccess(DatasetVersion draft) {
        if (!DRAFT.equals(draft.getStatus())) {
            throw notFound();
        }
        DatasetAsset asset = requireOwnedAsset(draft.getAssetId());
        return new DraftAccess(draft, asset);
    }

    private record DraftAccess(DatasetVersion draft, DatasetAsset asset) {
    }

    private record ChunkCleanup(
            String chunkId,
            String uploadId,
            String objectName,
            Integer ownerUserId
    ) {
    }
}
