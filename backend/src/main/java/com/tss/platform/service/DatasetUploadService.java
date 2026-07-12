package com.tss.platform.service;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.DatasetAppendPackageCompleteResponse;
import com.tss.platform.dto.DatasetCvFolderUploadResponse;
import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.DatasetUploadCompleteRequest;
import com.tss.platform.dto.DatasetUploadCompleteResponse;
import com.tss.platform.dto.DatasetUploadInitRequest;
import com.tss.platform.dto.DatasetUploadProgressDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetPackage;
import com.tss.platform.entity.DatasetUploadChunk;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.model.CvAnnotationFormat;
import com.tss.platform.model.CvTaskType;
import com.tss.platform.model.DatasetTaskType;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetPackageRepository;
import com.tss.platform.repository.DatasetUploadChunkRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.DatasetVersionPackageRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.repository.UploadChunkProgressSummary;
import com.tss.platform.security.AuthContext;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class DatasetUploadService {

    public static final class DatasetUploadAccessException extends IllegalArgumentException {

        private static final String MESSAGE = "dataset upload not found or no permission";

        public DatasetUploadAccessException() {
            super(MESSAGE);
        }

        private DatasetUploadAccessException(Throwable cause) {
            super(MESSAGE, cause);
        }
    }

    private static final Logger log = LoggerFactory.getLogger(DatasetUploadService.class);

    private static final int MIN_CHUNK_SIZE = 5 * 1024 * 1024;
    private static final int CHUNK_SIZE_GRANULARITY = 1024 * 1024;
    private static final int MAX_COMPOSE_SOURCES = 10_000;
    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETING = "COMPLETING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String VERSION_STATUS_DRAFT = "DRAFT";
    private static final String VERSION_STATUS_READY = "READY";
    private static final String IMPORT_STATUS_PENDING = "PENDING";
    private static final String UPLOAD_PURPOSE_INITIAL = "INITIAL_DATASET";
    private static final String UPLOAD_PURPOSE_APPEND = "APPEND_PACKAGE";
    private static final String GROUPING_MANIFEST = "MANIFEST";
    private static final String GROUPING_AUTO_DIRECTORY = "AUTO_DIRECTORY";
    private static final String PACKAGE_ROLE_APPEND = "APPEND";

    private final MinioClient minioClient;
    private final String bucket;
    private final DatasetZipValidator datasetZipValidator;
    private final DatasetVersionAllocationService versionAllocationService;
    private final DatasetUploadChunkService chunkUploadService;
    private final DatasetUploadSessionRepository sessionRepo;
    private final DatasetUploadChunkRepository chunkRepo;
    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetPackageRepository packageRepo;
    private final DatasetVersionPackageRepository versionPackageRepo;
    private final ImportJobRepository importJobRepo;
    private final AuthContext authContext;
    private final MinioDeleteTaskService minioDeleteTaskService;
    private final TransactionTemplate transactionTemplate;
    private final DatasetWorkspaceAuditService auditService;
    private ImportJobLauncher importJobLauncher;

    @Autowired
    public DatasetUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            DatasetUploadSessionRepository sessionRepo,
            DatasetUploadChunkRepository chunkRepo,
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            DatasetPackageRepository packageRepo,
            DatasetVersionPackageRepository versionPackageRepo,
            ImportJobRepository importJobRepo,
            AuthContext authContext,
            MinioDeleteTaskService minioDeleteTaskService,
            PlatformTransactionManager transactionManager,
            DatasetWorkspaceAuditService auditService
    ) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.datasetZipValidator = new DatasetZipValidator(minioClient, bucket);
        this.versionAllocationService = new DatasetVersionAllocationService(
                assetRepo,
                versionRepo,
                authContext
        );
        this.chunkUploadService = new DatasetUploadChunkService(
                minioClient,
                bucket,
                chunkRepo,
                sessionRepo,
                minioDeleteTaskService
        );
        this.sessionRepo = sessionRepo;
        this.chunkRepo = chunkRepo;
        this.assetRepo = assetRepo;
        this.versionRepo = versionRepo;
        this.packageRepo = packageRepo;
        this.versionPackageRepo = versionPackageRepo;
        this.importJobRepo = importJobRepo;
        this.authContext = authContext;
        this.minioDeleteTaskService = minioDeleteTaskService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.auditService = auditService;
    }

    public DatasetUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            DatasetUploadSessionRepository sessionRepo,
            DatasetUploadChunkRepository chunkRepo,
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            DatasetPackageRepository packageRepo,
            DatasetVersionPackageRepository versionPackageRepo,
            ImportJobRepository importJobRepo,
            AuthContext authContext,
            MinioDeleteTaskService minioDeleteTaskService,
            PlatformTransactionManager transactionManager
    ) {
        this(
                minioClient,
                minioConfig,
                sessionRepo,
                chunkRepo,
                assetRepo,
                versionRepo,
                packageRepo,
                versionPackageRepo,
                importJobRepo,
                authContext,
                minioDeleteTaskService,
                transactionManager,
                null
        );
    }

    @Autowired
    void setImportJobLauncher(ImportJobLauncher importJobLauncher) {
        this.importJobLauncher = importJobLauncher;
    }

    @Autowired(required = false)
    void setZipCentralDirectoryReader(ZipCentralDirectoryReader zipCentralDirectoryReader) {
        this.datasetZipValidator.setZipCentralDirectoryReader(zipCentralDirectoryReader);
    }

    DatasetUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            DatasetUploadSessionRepository sessionRepo,
            DatasetUploadChunkRepository chunkRepo,
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            AuthContext authContext,
            MinioDeleteTaskService minioDeleteTaskService
    ) {
        this(
                minioClient,
                minioConfig,
                sessionRepo,
                chunkRepo,
                assetRepo,
                versionRepo,
                null,
                null,
                null,
                authContext,
                minioDeleteTaskService,
                new PlatformTransactionManager() {
                    @Override
                    public TransactionStatus getTransaction(TransactionDefinition definition) {
                        return new SimpleTransactionStatus();
                    }

                    @Override
                    public void commit(TransactionStatus status) {
                    }

                    @Override
                    public void rollback(TransactionStatus status) {
                    }
                },
                null
        );
    }

    @Transactional
    public DatasetUploadProgressDto init(DatasetUploadInitRequest req) {
        validateInit(req);
        Integer operatorUserId = authContext.currentUserId();
        String taskType = DatasetTaskType.normalize(req.getType());
        String sampleGrouping = normalizeSampleGroupingForTask(
                taskType,
                req.getSampleGrouping()
        );
        String manifestPath = normalizeManifestPath(sampleGrouping, req.getManifestPath());
        boolean strictManifest = normalizeStrictManifestForTask(
                taskType,
                sampleGrouping,
                req.getStrictManifest()
        );
        validateGroupingForTask(taskType, sampleGrouping);
        String cvTaskType = CvTaskType.normalizeForTask(taskType, req.getCvTaskType());
        String annotationFormat = CvAnnotationFormat.normalizeForTask(taskType, req.getAnnotationFormat());
        DatasetAsset targetAsset = versionAllocationService.resolveTargetAsset(
                req.getAssetId(),
                taskType,
                cvTaskType,
                annotationFormat
        );
        Integer ownerUserId = targetAsset != null ? targetAsset.getOwnerUserId() : operatorUserId;
        String targetAssetId = targetAsset != null ? targetAsset.getId() : null;
        String datasetName = targetAsset != null ? targetAsset.getName() : req.getDatasetName().trim();
        Integer previewVersionNo = versionAllocationService.previewVersionNo(targetAssetId);
        boolean versionLabelGenerated = versionAllocationService.isVersionLabelGenerated(
                req.getVersionLabel(),
                req.getVersion()
        );
        String requestedLabel = versionAllocationService.defaultVersionLabel(
                req.getVersionLabel(),
                req.getVersion(),
                previewVersionNo
        );
        String parentVersionId = versionAllocationService.resolveParentVersionId(req.getParentVersionId(), targetAsset);
        validateDatasetFileName(taskType, req.getFileName());
        String fingerprint = normalizeText(req.getFileFingerprint());
        if (fingerprint != null) {
            DatasetUploadSession existing = sessionRepo
                    .findFirstByFileFingerprintAndStatusAndOwnerUserIdOrderByUpdatedAtDesc(
                            fingerprint,
                            STATUS_UPLOADING,
                            ownerUserId
                    )
                    .orElse(null);
            if (existing != null && sameUpload(existing, req, taskType, parentVersionId)) {
                existing.setRemark(req.getRemark());
                existing.setUpdatedAt(Instant.now());
                return progress(sessionRepo.save(existing));
            }
        }

        DatasetUploadSession session = new DatasetUploadSession();
        session.setId("dataset-upload-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", ""));
        session.setUploadPurpose(UPLOAD_PURPOSE_INITIAL);
        session.setFileFingerprint(fingerprint);
        session.setFileName(req.getFileName().trim());
        session.setFileSize(req.getFileSize());
        int chunkSize = calculateChunkSize(req.getFileSize());
        session.setChunkSize(chunkSize);
        session.setTotalChunks(calculateTotalChunks(req.getFileSize(), chunkSize));
        session.setDatasetName(datasetName);
        session.setVersion(requestedLabel);
        session.setVersionLabel(requestedLabel);
        session.setVersionNo(previewVersionNo);
        session.setVersionLabelGenerated(versionLabelGenerated);
        session.setType(taskType);
        session.setCvTaskType(cvTaskType);
        session.setAnnotationFormat(annotationFormat);
        session.setRemark(req.getRemark());
        session.setDescription(req.getDescription());
        session.setChangeLog(req.getChangeLog());
        session.setParentVersionId(parentVersionId);
        session.setSampleGrouping(sampleGrouping);
        session.setManifestPath(manifestPath);
        session.setStrictManifest(strictManifest);
        session.setAssetCreatedByUpload(false);
        session.setAssetId(targetAssetId);
        session.setStatus(STATUS_UPLOADING);
        session.setOwnerUserId(ownerUserId);
        Instant now = Instant.now();
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        return progress(sessionRepo.save(session));
    }

    @Transactional
    public DatasetUploadProgressDto initAppendPackage(
            String draftVersionId,
            DatasetPackageAppendInitRequest req
    ) {
        if (req == null) {
            throw new IllegalArgumentException("request body cannot be null");
        }
        requireText(req.getFileName(), "fileName cannot be blank");
        if (req.getFileSize() == null || req.getFileSize() <= 0) {
            throw new IllegalArgumentException("fileSize must be greater than 0");
        }
        DatasetVersion draft = requireAppendDraftForUpdate(draftVersionId);
        DatasetAsset asset = requireAppendAsset(draft);
        String taskType = DatasetTaskType.normalize(asset.getType());
        String sampleGrouping = normalizeSampleGroupingForTask(
                taskType,
                req.getSampleGrouping()
        );
        String manifestPath = normalizeManifestPath(sampleGrouping, req.getManifestPath());
        boolean strictManifest = normalizeStrictManifestForTask(
                taskType,
                sampleGrouping,
                req.getStrictManifest()
        );
        validateGroupingForTask(taskType, sampleGrouping);
        validateAppendPackageFileNameForTask(taskType, req.getFileName());

        DatasetUploadSession session = new DatasetUploadSession();
        session.setId("dataset-upload-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", ""));
        session.setUploadPurpose(UPLOAD_PURPOSE_APPEND);
        session.setFileFingerprint(normalizeText(req.getFileFingerprint()));
        session.setFileName(req.getFileName().trim());
        session.setFileSize(req.getFileSize());
        int chunkSize = calculateChunkSize(req.getFileSize());
        session.setChunkSize(chunkSize);
        session.setTotalChunks(calculateTotalChunks(req.getFileSize(), chunkSize));
        session.setDatasetName(asset.getName());
        session.setVersion(draft.getVersion());
        session.setVersionLabel(draft.getVersionLabel());
        session.setVersionNo(draft.getVersionNo());
        session.setVersionLabelGenerated(false);
        session.setType(taskType);
        session.setCvTaskType(draft.getCvTaskType());
        session.setAnnotationFormat(draft.getAnnotationFormat());
        session.setParentVersionId(draft.getParentVersionId());
        session.setSampleGrouping(sampleGrouping);
        session.setManifestPath(manifestPath);
        session.setStrictManifest(strictManifest);
        session.setAssetCreatedByUpload(false);
        session.setAssetId(asset.getId());
        session.setVersionId(draft.getId());
        session.setStatus(STATUS_UPLOADING);
        session.setOwnerUserId(asset.getOwnerUserId());
        Instant now = Instant.now();
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        DatasetUploadSession saved = sessionRepo.save(session);
        if (auditService != null) {
            auditService.recordAppendInit(asset, draft, saved);
        }
        return progress(saved);
    }

    @Transactional
    public DatasetUploadProgressDto saveChunk(String uploadId, Integer partIndex, MultipartFile file) {
        DatasetUploadSession session = getSessionForUpdate(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return progress(session);
        }
        if (!STATUS_UPLOADING.equals(session.getStatus())) {
            throw new IllegalArgumentException(
                    "upload session must be UPLOADING, current status=" + session.getStatus()
            );
        }
        return progress(chunkUploadService.saveChunk(session, partIndex, file));
    }

    @Transactional(readOnly = true)
    public DatasetUploadProgressDto getProgress(String uploadId) {
        return progress(getSession(uploadId));
    }

    public DatasetUploadCompleteResponse complete(DatasetUploadCompleteRequest req) {
        if (req == null || req.getUploadId() == null || req.getUploadId().isBlank()) {
            throw new IllegalArgumentException("uploadId 不能为空");
        }
        DatasetUploadSession session = getSession(req.getUploadId());
        if (UPLOAD_PURPOSE_APPEND.equals(session.getUploadPurpose())) {
            throw new IllegalArgumentException(
                    "append package upload must use the package complete endpoint"
            );
        }
        if (isMultimodalImportUpload(session)) {
            return completeManifestUpload(session.getId());
        }
        AtomicReference<String> composedDestination = new AtomicReference<>();
        try {
            DatasetUploadCompleteResponse result = transactionTemplate.execute(
                    status -> completeLegacyUpload(req.getUploadId(), composedDestination)
            );
            if (result == null) {
                throw new IllegalArgumentException("保存数据集上传记录失败");
            }
            composedDestination.set(null);
            return result;
        } catch (RuntimeException exception) {
            String destinationObject = composedDestination.getAndSet(null);
            if (destinationObject != null) {
                removeObjectQuietly(destinationObject, req.getUploadId());
            }
            throw exception;
        }
    }

    public DatasetAppendPackageCompleteResponse completeAppendPackage(
            String draftVersionId,
            DatasetUploadCompleteRequest req
    ) {
        if (req == null || req.getUploadId() == null || req.getUploadId().isBlank()) {
            throw new IllegalArgumentException("uploadId cannot be blank");
        }
        DatasetUploadSession initial = getSession(req.getUploadId());
        requireAppendSession(initial, draftVersionId);
        requireAppendDraft(draftVersionId);
        if (STATUS_COMPLETED.equals(initial.getStatus())) {
            launchPendingImport(initial);
            log.info(
                    "Dataset append package upload complete replay: uploadId={}, datasetId={}, versionId={}, importJobId={}, status={}",
                    initial.getId(),
                    initial.getAssetId(),
                    initial.getVersionId(),
                    initial.getImportJobId(),
                    initial.getStatus()
            );
            return appendCompletedPayload(initial);
        }

        AppendCompletionClaim completionClaim = transactionTemplate.execute(
                status -> claimAppendCompletion(initial.getId(), draftVersionId)
        );
        if (completionClaim == null) {
            throw new IllegalArgumentException("failed to claim append upload session");
        }
        DatasetUploadSession claimed = completionClaim.session();
        requireAppendSession(claimed, draftVersionId);
        if (STATUS_COMPLETED.equals(claimed.getStatus())) {
            launchPendingImport(claimed);
            log.info(
                    "Dataset append package upload complete replay: uploadId={}, datasetId={}, versionId={}, importJobId={}, status={}",
                    claimed.getId(),
                    claimed.getAssetId(),
                    claimed.getVersionId(),
                    claimed.getImportJobId(),
                    claimed.getStatus()
            );
            return appendCompletedPayload(claimed);
        }
        List<DatasetUploadChunk> chunks = completionClaim.chunks();
        String destinationObject = appendPackageDestinationObject(claimed);
        DatasetUploadSession completed;
        try {
            List<ComposeSource> sources = chunks.stream()
                    .map(chunk -> ComposeSource.builder()
                            .bucket(bucket)
                            .object(chunk.getObjectName())
                            .build())
                    .collect(Collectors.toList());
            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(bucket)
                            .object(destinationObject)
                            .sources(sources)
                            .build()
            );
            StatObjectResponse stat = minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucket)
                            .object(destinationObject)
                            .build()
            );
            if (stat.size() != claimed.getFileSize()) {
                throw new IllegalArgumentException(
                        "composed append package size does not match upload session"
                );
            }
            if (!"MULTIMODAL".equals(DatasetTaskType.normalize(claimed.getType()))) {
                validateDatasetObjectFormat(
                        claimed.getType(),
                        claimed.getAnnotationFormat(),
                        claimed.getFileName(),
                        destinationObject,
                        stat.size()
                );
            }
            completed = transactionTemplate.execute(status ->
                    finalizeAppendPackage(
                            claimed.getId(),
                            draftVersionId,
                            destinationObject,
                            stat.size()
                    )
            );
            if (completed == null) {
                throw new IllegalArgumentException("failed to create append import job");
            }
        } catch (Exception exception) {
            removeObjectQuietly(destinationObject, claimed.getId());
            transactionTemplate.executeWithoutResult(status ->
                    resetAppendSession(claimed.getId(), draftVersionId)
            );
            if (exception instanceof DatasetUploadAccessException accessException) {
                throw accessException;
            }
            throw new IllegalArgumentException(
                    "failed to compose append package: " + rootMessage(exception)
            );
        }

        registerChunkCleanup(claimed.getId(), chunks);
        DatasetAppendPackageCompleteResponse response = appendCompletedPayload(completed);
        launchPendingImport(completed);
        log.info(
                "Dataset append package upload completed: uploadId={}, datasetId={}, versionId={}, importJobId={}, status={}",
                completed.getId(),
                completed.getAssetId(),
                completed.getVersionId(),
                completed.getImportJobId(),
                completed.getStatus()
        );
        return response;
    }

    private DatasetUploadCompleteResponse completeLegacyUpload(
            String uploadId,
            AtomicReference<String> composedDestination
    ) {
        DatasetUploadSession session = claimCompleting(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            log.info(
                    "Dataset upload complete replay: uploadId={}, datasetId={}, versionId={}, status={}",
                    session.getId(),
                    session.getAssetId(),
                    session.getVersionId(),
                    session.getStatus()
            );
            return completedPayload(session);
        }

        List<DatasetUploadChunk> chunks = chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
        if (chunks.size() != session.getTotalChunks()) {
            throw new IllegalArgumentException("分片未上传完成");
        }
        for (int i = 0; i < session.getTotalChunks(); i += 1) {
            if (!Integer.valueOf(i).equals(chunks.get(i).getPartIndex())) {
                throw new IllegalArgumentException("缺少分片: " + i);
            }
        }

        boolean createAsset = session.getAssetId() == null || session.getAssetId().isBlank();
        String assetId = createAsset
                ? "dataset-asset-" + UUID.randomUUID().toString().replace("-", "")
                : session.getAssetId();
        String versionId = "dataset-ver-" + UUID.randomUUID().toString().replace("-", "");
        DatasetVersionAllocationService.VersionAllocation allocation = versionAllocationService.allocateVersion(
                session,
                assetId,
                createAsset
        );
        versionAllocationService.requireUniqueVersionLabel(assetId, allocation.versionLabel());
        String destName = "users/" + session.getOwnerUserId()
                + "/datasets/" + assetId + "/" + sanitizeSegment("v" + allocation.versionNo())
                + "/" + sanitizeSegment(session.getFileName());
        Long fileCount;
        long composedSize;
        try {
            List<ComposeSource> sources = chunks.stream()
                    .map(chunk -> ComposeSource.builder()
                            .bucket(bucket)
                            .object(chunk.getObjectName())
                            .build())
                    .collect(Collectors.toList());
            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(bucket)
                            .object(destName)
                            .sources(sources)
                            .build()
            );
            composedDestination.set(destName);
            StatObjectResponse stat = minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucket)
                            .object(destName)
                            .build()
            );
            composedSize = stat.size();
            if (composedSize != session.getFileSize()) {
                throw new IllegalArgumentException("合并后文件大小与上传会话不一致");
            }
            fileCount = validateDatasetObjectFormat(
                    session.getType(),
                    session.getAnnotationFormat(),
                    session.getFileName(),
                    destName,
                    composedSize
            );
        } catch (Exception e) {
            removeObjectQuietly(destName, session.getId());
            composedDestination.compareAndSet(destName, null);
            throw new IllegalArgumentException("合并文件失败: " + e.getMessage());
        }

        try {
            Instant now = Instant.now();
            DatasetAsset asset = allocation.asset();
            if (createAsset) {
                asset.setId(assetId);
                asset.setName(session.getDatasetName());
                asset.setType(session.getType());
                asset.setCvTaskType(session.getCvTaskType());
                asset.setAnnotationFormat(session.getAnnotationFormat());
                asset.setRemark(session.getRemark());
                asset.setOwnerUserId(session.getOwnerUserId());
                asset.setCreatedAt(now);
                asset.setUpdatedAt(now);
                assetRepo.saveAndFlush(asset);
            }

            DatasetVersion version = new DatasetVersion();
            version.setId(versionId);
            version.setAssetId(assetId);
            version.setVersionNo(allocation.versionNo());
            version.setVersionLabel(allocation.versionLabel());
            version.setVersion(allocation.versionLabel());
            version.setFileName(session.getFileName());
            version.setStoragePath(destName);
            version.setSizeBytes(composedSize);
            version.setFileCount(fileCount);
            version.setCvTaskType(session.getCvTaskType());
            version.setAnnotationFormat(session.getAnnotationFormat());
            version.setRemark(session.getRemark());
            version.setDescription(session.getDescription());
            version.setChangeLog(session.getChangeLog());
            version.setParentVersionId(allocation.parentVersionId());
            version.setStatus(VERSION_STATUS_READY);
            version.setFileFingerprint(session.getFileFingerprint());
            version.setOwnerUserId(session.getOwnerUserId());
            version.setCreatedBy(authContext.currentUserId());
            version.setCreatedAt(now);
            version.setPublishedAt(now);
            versionRepo.saveAndFlush(version);

            session.setStatus(STATUS_COMPLETED);
            session.setStoragePath(destName);
            session.setAssetId(assetId);
            session.setVersionId(versionId);
            session.setVersionNo(allocation.versionNo());
            session.setVersionLabel(allocation.versionLabel());
            session.setVersion(allocation.versionLabel());
            session.setParentVersionId(allocation.parentVersionId());
            session.setUpdatedAt(now);
            sessionRepo.saveAndFlush(session);
            asset.setCurrentVersionId(versionId);
            asset.setUpdatedAt(now);
            assetRepo.saveAndFlush(asset);
        } catch (RuntimeException e) {
            removeObjectQuietly(destName, session.getId());
            composedDestination.compareAndSet(destName, null);
            throw new IllegalArgumentException("保存数据集上传记录失败: " + rootMessage(e));
        }
        registerChunkCleanup(session.getId(), chunks);

        log.info(
                "Dataset upload completed: uploadId={}, datasetId={}, versionId={}, status={}",
                session.getId(),
                assetId,
                versionId,
                STATUS_COMPLETED
        );
        return completedPayload(session);
    }

    private DatasetUploadCompleteResponse completeManifestUpload(String uploadId) {
        DatasetUploadSession initial = getSession(uploadId);
        if (STATUS_COMPLETED.equals(initial.getStatus())) {
            launchPendingImport(initial);
            log.info(
                    "Dataset manifest upload complete replay: uploadId={}, datasetId={}, versionId={}, importJobId={}, status={}",
                    initial.getId(),
                    initial.getAssetId(),
                    initial.getVersionId(),
                    initial.getImportJobId(),
                    initial.getStatus()
            );
            return completedPayload(initial);
        }
        ManifestReservation reservation = transactionTemplate.execute(
                status -> reserveManifestVersion(uploadId)
        );
        if (reservation == null) {
            throw new IllegalArgumentException("创建多模态数据集草稿失败");
        }
        if (STATUS_COMPLETED.equals(reservation.session().getStatus())) {
            log.info(
                    "Dataset manifest upload complete replay: uploadId={}, datasetId={}, versionId={}, importJobId={}, status={}",
                    reservation.session().getId(),
                    reservation.session().getAssetId(),
                    reservation.session().getVersionId(),
                    reservation.session().getImportJobId(),
                    reservation.session().getStatus()
            );
            return completedPayload(reservation.session());
        }

        String destName = reservation.destinationObject();
        DatasetUploadSession completed;
        try {
            List<ComposeSource> sources = reservation.chunks().stream()
                    .map(chunk -> ComposeSource.builder()
                            .bucket(bucket)
                            .object(chunk.getObjectName())
                            .build())
                    .collect(Collectors.toList());
            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(bucket)
                            .object(destName)
                            .sources(sources)
                            .build()
            );
            StatObjectResponse stat = minioClient.statObject(
                    StatObjectArgs.builder()
                            .bucket(bucket)
                            .object(destName)
                            .build()
            );
            if (stat.size() != reservation.session().getFileSize()) {
                throw new IllegalArgumentException("合并后文件大小与上传会话不一致");
            }

            completed = transactionTemplate.execute(
                    status -> finalizeManifestUpload(uploadId, destName, stat.size())
            );
            if (completed == null) {
                throw new IllegalArgumentException("创建导入任务失败");
            }
        } catch (Exception e) {
            removeObjectQuietly(destName, uploadId);
            try {
                transactionTemplate.executeWithoutResult(
                        status -> rollbackManifestReservation(uploadId)
                );
            } catch (RuntimeException exception) {
                log.warn(
                        "Dataset manifest upload reservation rollback failed: uploadId={}, exceptionType={}",
                        uploadId,
                        exception.getClass().getSimpleName()
                );
            }
            if (e instanceof DatasetUploadAccessException accessException) {
                throw accessException;
            }
            throw new IllegalArgumentException("合并文件失败: " + rootMessage(e));
        }
        registerChunkCleanup(uploadId, reservation.chunks());
        launchPendingImport(completed);
        log.info(
                "Dataset manifest upload completed: uploadId={}, datasetId={}, versionId={}, importJobId={}, status={}",
                completed.getId(),
                completed.getAssetId(),
                completed.getVersionId(),
                completed.getImportJobId(),
                completed.getStatus()
        );
        return completedPayload(completed);
    }

    private void launchPendingImport(DatasetUploadSession session) {
        if (importJobLauncher == null
                || importJobRepo == null
                || session.getImportJobId() == null
                || session.getImportJobId().isBlank()) {
            return;
        }
        importJobRepo.findById(session.getImportJobId())
                .filter(job -> IMPORT_STATUS_PENDING.equals(job.getStatus()))
                .ifPresent(job -> importJobLauncher.launch(job.getId()));
    }

    private ManifestReservation reserveManifestVersion(String uploadId) {
        DatasetUploadSession session = claimCompleting(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return new ManifestReservation(session, session.getStoragePath(), List.of());
        }

        List<DatasetUploadChunk> chunks = requireCompleteChunks(session);

        boolean createAsset = session.getAssetId() == null || session.getAssetId().isBlank();
        String assetId = createAsset
                ? "dataset-asset-" + UUID.randomUUID().toString().replace("-", "")
                : session.getAssetId();
        DatasetVersionAllocationService.VersionAllocation allocation = versionAllocationService.allocateVersion(
                session,
                assetId,
                createAsset
        );
        if (!createAsset) {
            versionAllocationService.requireNoActiveDraft(assetId);
        }
        versionAllocationService.requireUniqueVersionLabel(assetId, allocation.versionLabel());
        String versionId = "dataset-ver-" + UUID.randomUUID().toString().replace("-", "");
        String destName = manifestDestinationObject(
                session.getOwnerUserId(),
                assetId,
                allocation.versionNo(),
                session.getFileName()
        );
        Instant now = Instant.now();

        DatasetAsset asset = allocation.asset();
        if (createAsset) {
            asset.setId(assetId);
            asset.setName(session.getDatasetName());
            asset.setType(session.getType());
            asset.setCvTaskType(session.getCvTaskType());
            asset.setAnnotationFormat(session.getAnnotationFormat());
            asset.setRemark(session.getRemark());
            asset.setOwnerUserId(session.getOwnerUserId());
            asset.setCreatedAt(now);
            asset.setUpdatedAt(now);
            asset.setDeleted(false);
            assetRepo.saveAndFlush(asset);
        }

        DatasetVersion version = new DatasetVersion();
        version.setId(versionId);
        version.setAssetId(assetId);
        version.setVersionNo(allocation.versionNo());
        version.setVersionLabel(allocation.versionLabel());
        version.setVersion(allocation.versionLabel());
        version.setCvTaskType(session.getCvTaskType());
        version.setAnnotationFormat(session.getAnnotationFormat());
        version.setRemark(session.getRemark());
        version.setDescription(session.getDescription());
        version.setChangeLog(session.getChangeLog());
        version.setParentVersionId(allocation.parentVersionId());
        version.setStatus(VERSION_STATUS_DRAFT);
        version.setFileFingerprint(session.getFileFingerprint());
        version.setOwnerUserId(session.getOwnerUserId());
        version.setCreatedBy(authContext.currentUserId());
        version.setCreatedAt(now);
        version.setDeleted(false);
        try {
            versionRepo.saveAndFlush(version);
        } catch (DataIntegrityViolationException e) {
            if (isOneActiveDraftViolation(e)) {
                throw new IllegalArgumentException(
                        "dataset asset already has an active DRAFT version: " + assetId
                );
            }
            throw e;
        }

        session.setAssetId(assetId);
        session.setVersionId(versionId);
        session.setVersionNo(allocation.versionNo());
        session.setVersionLabel(allocation.versionLabel());
        session.setVersion(allocation.versionLabel());
        session.setParentVersionId(allocation.parentVersionId());
        session.setAssetCreatedByUpload(createAsset);
        session.setUpdatedAt(now);
        sessionRepo.saveAndFlush(session);
        return new ManifestReservation(session, destName, chunks);
    }

    private AppendCompletionClaim claimAppendCompletion(
            String uploadId,
            String draftVersionId
    ) {
        DatasetUploadSession session = claimCompleting(uploadId);
        requireAppendSession(session, draftVersionId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return new AppendCompletionClaim(session, List.of());
        }
        return new AppendCompletionClaim(session, requireCompleteChunks(session));
    }

    private DatasetUploadSession finalizeManifestUpload(String uploadId, String storagePath, long sizeBytes) {
        DatasetUploadSession session = getSession(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return session;
        }
        if (!STATUS_COMPLETING.equals(session.getStatus()) || session.getVersionId() == null) {
            throw new IllegalArgumentException("上传会话不处于可完成状态");
        }
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(session.getVersionId())
                .orElseThrow(() -> new IllegalArgumentException("dataset version not found"));
        if (!VERSION_STATUS_DRAFT.equals(version.getStatus())) {
            throw new IllegalArgumentException("多模态版本必须保持 DRAFT");
        }

        Instant now = Instant.now();
        version.setFileName(session.getFileName());
        version.setStoragePath(storagePath);
        version.setSizeBytes(sizeBytes);
        versionRepo.saveAndFlush(version);

        DatasetPackage datasetPackage = new DatasetPackage();
        datasetPackage.setId("dataset-pkg-" + UUID.randomUUID().toString().replace("-", ""));
        datasetPackage.setDatasetAssetId(version.getAssetId());
        datasetPackage.setStoragePath(storagePath);
        datasetPackage.setFileName(session.getFileName());
        datasetPackage.setSizeBytes(sizeBytes);
        datasetPackage.setManifestPath(session.getManifestPath());
        datasetPackage.setStatus(VERSION_STATUS_READY);
        datasetPackage.setCreatedAt(now);
        datasetPackage.setDeleted(false);
        datasetPackage = packageRepo.saveAndFlush(datasetPackage);

        DatasetVersionPackage versionPackage = new DatasetVersionPackage();
        versionPackage.setDatasetVersionId(version.getId());
        versionPackage.setPackageId(datasetPackage.getId());
        versionPackage.setPackageRole("PRIMARY");
        versionPackage.setPackageOrder(0);
        versionPackage.setCreatedAt(now);
        versionPackageRepo.saveAndFlush(versionPackage);

        DatasetPackage primaryPackage = datasetPackage;
        ImportJob job = importJobRepo
                .findByDatasetVersionIdAndPackageId(version.getId(), primaryPackage.getId())
                .orElseGet(() -> {
                    ImportJob value = new ImportJob();
                    value.setId("ijob-" + UUID.randomUUID().toString().replace("-", ""));
                    value.setDatasetVersionId(version.getId());
                    value.setPackageId(primaryPackage.getId());
                    value.setStatus(IMPORT_STATUS_PENDING);
                    value.setProgress(0);
                    value.setImportedSamples(0);
                    value.setOwnerUserId(session.getOwnerUserId());
                    value.setCreatedAt(now);
                    value.setUpdatedAt(now);
                    return importJobRepo.saveAndFlush(value);
                });

        session.setStoragePath(storagePath);
        session.setImportJobId(job.getId());
        session.setStatus(STATUS_COMPLETED);
        session.setUpdatedAt(now);
        return sessionRepo.saveAndFlush(session);
    }

    private DatasetUploadSession finalizeAppendPackage(
            String uploadId,
            String draftVersionId,
            String storagePath,
            long sizeBytes
    ) {
        DatasetUploadSession session = getSession(uploadId);
        requireAppendSession(session, draftVersionId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return session;
        }
        if (!STATUS_COMPLETING.equals(session.getStatus())) {
            throw new IllegalArgumentException(
                    "append upload session is not completing: " + session.getStatus()
            );
        }

        DatasetVersion draft = versionRepo
                .findByIdAndDeletedFalseForUpdate(draftVersionId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset workspace version not found or no permission"
                ));
        DatasetAsset asset = requireAppendAsset(draft);
        if (!VERSION_STATUS_DRAFT.equals(draft.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset version must be DRAFT: " + draft.getId()
            );
        }

        Instant now = Instant.now();
        DatasetPackage datasetPackage = new DatasetPackage();
        datasetPackage.setId("dataset-pkg-" + UUID.randomUUID().toString().replace("-", ""));
        datasetPackage.setDatasetAssetId(asset.getId());
        datasetPackage.setStoragePath(storagePath);
        datasetPackage.setFileName(session.getFileName());
        datasetPackage.setSizeBytes(sizeBytes);
        datasetPackage.setManifestPath(session.getManifestPath());
        datasetPackage.setStatus(IMPORT_STATUS_PENDING);
        datasetPackage.setCreatedAt(now);
        datasetPackage.setDeleted(false);
        datasetPackage = packageRepo.saveAndFlush(datasetPackage);

        Integer maxOrder = versionPackageRepo
                .findMaxPackageOrderByDatasetVersionId(draft.getId());
        DatasetVersionPackage relation = new DatasetVersionPackage();
        relation.setDatasetVersionId(draft.getId());
        relation.setPackageId(datasetPackage.getId());
        relation.setPackageRole(PACKAGE_ROLE_APPEND);
        relation.setPackageOrder((maxOrder == null ? -1 : maxOrder) + 1);
        relation.setCreatedAt(now);
        versionPackageRepo.saveAndFlush(relation);

        ImportJob job = new ImportJob();
        job.setId("ijob-" + UUID.randomUUID().toString().replace("-", ""));
        job.setDatasetVersionId(draft.getId());
        job.setPackageId(datasetPackage.getId());
        job.setStatus(IMPORT_STATUS_PENDING);
        job.setProgress(0);
        job.setImportedSamples(0);
        job.setOwnerUserId(asset.getOwnerUserId());
        job.setCreatedAt(now);
        job.setUpdatedAt(now);
        job = importJobRepo.saveAndFlush(job);

        session.setStoragePath(storagePath);
        session.setImportJobId(job.getId());
        session.setStatus(STATUS_COMPLETED);
        session.setUpdatedAt(now);
        DatasetUploadSession saved = sessionRepo.saveAndFlush(session);
        if (auditService != null) {
            auditService.recordAppendCompleted(asset, draft, saved, datasetPackage, job);
        }
        return saved;
    }

    private void resetAppendSession(String uploadId, String draftVersionId) {
        DatasetUploadSession session = sessionRepo.findById(uploadId).orElse(null);
        if (session == null || STATUS_COMPLETED.equals(session.getStatus())) {
            return;
        }
        requireAppendSession(session, draftVersionId);
        session.setStatus(STATUS_UPLOADING);
        session.setStoragePath(null);
        session.setImportJobId(null);
        session.setUpdatedAt(Instant.now());
        sessionRepo.saveAndFlush(session);
        log.info(
                "Dataset append upload session reset after failed complete: uploadId={}, versionId={}, status={}",
                uploadId,
                draftVersionId,
                STATUS_UPLOADING
        );
    }

    private void rollbackManifestReservation(String uploadId) {
        DatasetUploadSession session = sessionRepo.findById(uploadId).orElse(null);
        if (session == null || STATUS_COMPLETED.equals(session.getStatus())) {
            return;
        }
        String versionId = session.getVersionId();
        String assetId = session.getAssetId();
        boolean deleteAsset = Boolean.TRUE.equals(session.getAssetCreatedByUpload());

        session.setStatus(STATUS_UPLOADING);
        session.setStoragePath(null);
        session.setVersionId(null);
        session.setVersionNo(null);
        session.setImportJobId(null);
        if (deleteAsset) {
            session.setAssetId(null);
        }
        session.setAssetCreatedByUpload(false);
        session.setUpdatedAt(Instant.now());
        sessionRepo.saveAndFlush(session);

        if (versionId != null) {
            versionRepo.findById(versionId).ifPresent(versionRepo::delete);
        }
        if (deleteAsset && assetId != null) {
            assetRepo.findById(assetId).ifPresent(assetRepo::delete);
        }
        log.info(
                "Dataset manifest upload reservation rolled back: uploadId={}, datasetId={}, versionId={}, deleteAsset={}",
                uploadId,
                assetId,
                versionId,
                deleteAsset
        );
    }

    private List<DatasetUploadChunk> requireCompleteChunks(DatasetUploadSession session) {
        List<DatasetUploadChunk> chunks = chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
        if (chunks.size() != session.getTotalChunks()) {
            throw new IllegalArgumentException("分片未上传完成");
        }
        for (int i = 0; i < session.getTotalChunks(); i += 1) {
            if (!Integer.valueOf(i).equals(chunks.get(i).getPartIndex())) {
                throw new IllegalArgumentException("缺少分片: " + i);
            }
        }
        return chunks;
    }

    private boolean isMultimodalImportUpload(DatasetUploadSession session) {
        return "MULTIMODAL".equals(session.getType())
                && isMultimodalGrouping(session.getSampleGrouping());
    }

    @Transactional
    public DatasetCvFolderUploadResponse uploadCvFolder(
            String assetIdValue,
            String datasetName,
            String versionValue,
            String versionLabelValue,
            String type,
            String cvTaskTypeValue,
            String annotationFormatValue,
            String remark,
            String description,
            String changeLog,
            String parentVersionIdValue,
            List<MultipartFile> files,
            List<String> paths
    ) {
        String taskType = DatasetTaskType.normalize(type);
        String cvTaskType = CvTaskType.normalizeForTask(taskType, cvTaskTypeValue);
        String annotationFormat = CvAnnotationFormat.normalizeForTask(taskType, annotationFormatValue);
        DatasetAsset targetAsset = versionAllocationService.resolveTargetAsset(
                assetIdValue,
                taskType,
                cvTaskType,
                annotationFormat
        );
        if (targetAsset == null) {
            requireText(datasetName, "datasetName 不能为空");
        }
        if (!"CV".equals(taskType)) {
            throw new IllegalArgumentException("图片文件夹上传仅支持 CV 数据集");
        }
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("图片文件夹不能为空");
        }
        if (paths == null || paths.size() != files.size()) {
            throw new IllegalArgumentException("paths 必须与 files 一一对应");
        }

        Integer operatorUserId = authContext.currentUserId();
        boolean createAsset = targetAsset == null;
        Integer ownerUserId = createAsset ? operatorUserId : targetAsset.getOwnerUserId();
        String assetId = createAsset ? "dataset-asset-" + UUID.randomUUID().toString().replace("-", "") : targetAsset.getId();
        String effectiveDatasetName = createAsset ? datasetName.trim() : targetAsset.getName();
        String parentVersionId = versionAllocationService.resolveParentVersionId(parentVersionIdValue, targetAsset);
        DatasetVersionAllocationService.VersionAllocation allocation = versionAllocationService.allocateVersion(
                assetId,
                createAsset,
                versionAllocationService.defaultVersionLabel(versionLabelValue, versionValue, createAsset ? 1 : null),
                parentVersionId
        );
        versionAllocationService.requireUniqueVersionLabel(assetId, allocation.versionLabel());
        String versionId = "dataset-ver-" + UUID.randomUUID().toString().replace("-", "");
        String fileName = sanitizeSegment(effectiveDatasetName) + "-" + sanitizeSegment("v" + allocation.versionNo()) + "-folder.zip";
        String destName = "users/" + ownerUserId + "/datasets/" + assetId + "/" + sanitizeSegment("v" + allocation.versionNo()) + "/" + fileName;
        Path tempZip = null;

        try {
            tempZip = Files.createTempFile("dataset-folder-", ".zip");
            int imageCount = writeCvFolderZip(tempZip, files, paths, annotationFormat);
            if (imageCount <= 0) {
                throw new IllegalArgumentException("CV 图片文件夹必须包含图片文件");
            }
            long sizeBytes = Files.size(tempZip);
            try (InputStream is = Files.newInputStream(tempZip)) {
                minioClient.putObject(
                        PutObjectArgs.builder()
                                .bucket(bucket)
                                .object(destName)
                                .stream(is, sizeBytes, -1)
                                .contentType("application/zip")
                                .build()
                );
            }
            Long fileCount = validateDatasetObjectFormat(
                    taskType,
                    annotationFormat,
                    fileName,
                    destName,
                    sizeBytes
            );

            Instant now = Instant.now();
            DatasetAsset asset = allocation.asset();
            if (createAsset) {
                asset.setId(assetId);
                asset.setName(effectiveDatasetName);
                asset.setType(taskType);
                asset.setCvTaskType(cvTaskType);
                asset.setAnnotationFormat(annotationFormat);
                asset.setRemark(remark);
                asset.setOwnerUserId(ownerUserId);
                asset.setCreatedAt(now);
                asset.setUpdatedAt(now);
                assetRepo.saveAndFlush(asset);
            }

            DatasetVersion versionEntity = new DatasetVersion();
            versionEntity.setId(versionId);
            versionEntity.setAssetId(assetId);
            versionEntity.setVersionNo(allocation.versionNo());
            versionEntity.setVersionLabel(allocation.versionLabel());
            versionEntity.setVersion(allocation.versionLabel());
            versionEntity.setFileName(fileName);
            versionEntity.setStoragePath(destName);
            versionEntity.setSizeBytes(sizeBytes);
            versionEntity.setFileCount(fileCount);
            versionEntity.setCvTaskType(cvTaskType);
            versionEntity.setAnnotationFormat(annotationFormat);
            versionEntity.setRemark(remark);
            versionEntity.setDescription(description);
            versionEntity.setChangeLog(changeLog);
            versionEntity.setParentVersionId(allocation.parentVersionId());
            versionEntity.setStatus(VERSION_STATUS_READY);
            versionEntity.setOwnerUserId(ownerUserId);
            versionEntity.setCreatedBy(operatorUserId);
            versionEntity.setCreatedAt(now);
            versionEntity.setPublishedAt(now);
            versionRepo.saveAndFlush(versionEntity);
            asset.setCurrentVersionId(versionId);
            asset.setUpdatedAt(now);
            assetRepo.saveAndFlush(asset);

            return completedPayload(
                    null,
                    assetId,
                    versionId,
                    effectiveDatasetName,
                    allocation.versionLabel(),
                    allocation.versionNo(),
                    allocation.versionLabel(),
                    description,
                    changeLog,
                    allocation.parentVersionId(),
                    taskType,
                    cvTaskType,
                    annotationFormat,
                    remark,
                    fileName,
                    destName,
                    sizeBytes,
                    ownerUserId,
                    now,
                    now
            );
        } catch (IllegalArgumentException e) {
            removeObjectQuietly(destName);
            throw e;
        } catch (Exception e) {
            removeObjectQuietly(destName);
            throw new IllegalArgumentException("图片文件夹上传失败: " + e.getMessage());
        } finally {
            if (tempZip != null) {
                try {
                    Files.deleteIfExists(tempZip);
                } catch (Exception ignored) {
                    // 临时 zip 清理失败不影响上传结果。
                }
            }
        }
    }

    private void validateInit(DatasetUploadInitRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        requireText(req.getFileName(), "fileName 不能为空");
        if (req.getFileSize() == null || req.getFileSize() <= 0) {
            throw new IllegalArgumentException("fileSize 必须大于 0");
        }
        if (req.getAssetId() == null || req.getAssetId().isBlank()) {
            requireText(req.getDatasetName(), "datasetName 不能为空");
        }
        String taskType = DatasetTaskType.normalize(req.getType());
        String sampleGrouping = normalizeSampleGroupingForTask(
                taskType,
                req.getSampleGrouping()
        );
        normalizeManifestPath(sampleGrouping, req.getManifestPath());
        normalizeStrictManifestForTask(taskType, sampleGrouping, req.getStrictManifest());
        validateGroupingForTask(taskType, sampleGrouping);
        CvTaskType.normalizeForTask(taskType, req.getCvTaskType());
        CvAnnotationFormat.normalizeForTask(taskType, req.getAnnotationFormat());
        validateDatasetFileName(taskType, req.getFileName());
    }

    private DatasetUploadSession getSession(String uploadId) {
        if (uploadId == null || uploadId.isBlank()) {
            throw new DatasetUploadAccessException();
        }
        DatasetUploadSession session = sessionRepo.findById(uploadId)
                .orElseThrow(DatasetUploadAccessException::new);
        requireUploadSessionAccess(session);
        return session;
    }

    private DatasetUploadSession getSessionForUpdate(String uploadId) {
        if (uploadId == null || uploadId.isBlank()) {
            throw new DatasetUploadAccessException();
        }
        DatasetUploadSession session = sessionRepo.findByIdForUpdate(uploadId)
                .orElseThrow(DatasetUploadAccessException::new);
        requireUploadSessionAccess(session);
        return session;
    }

    private void requireUploadSessionAccess(DatasetUploadSession session) {
        try {
            authContext.requireOwnerAccess(
                    session.getOwnerUserId(),
                    "uploadId invalid or not accessible"
            );
        } catch (IllegalArgumentException exception) {
            throw new DatasetUploadAccessException(exception);
        }
    }

    private DatasetVersion requireAppendDraft(String draftVersionId) {
        if (draftVersionId == null || draftVersionId.isBlank()) {
            throw new IllegalArgumentException(
                    "dataset workspace version not found or no permission"
            );
        }
        DatasetVersion draft = versionRepo.findByIdAndDeletedFalse(draftVersionId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset workspace version not found or no permission"
                ));
        if (!VERSION_STATUS_DRAFT.equals(draft.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset workspace version not found or no permission"
            );
        }
        requireAppendAsset(draft);
        return draft;
    }

    private DatasetVersion requireAppendDraftForUpdate(String draftVersionId) {
        if (draftVersionId == null || draftVersionId.isBlank()) {
            throw new IllegalArgumentException(
                    "dataset workspace version not found or no permission"
            );
        }
        DatasetVersion draft = versionRepo.findByIdAndDeletedFalseForUpdate(draftVersionId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset workspace version not found or no permission"
                ));
        if (!VERSION_STATUS_DRAFT.equals(draft.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset workspace version not found or no permission"
            );
        }
        requireAppendAsset(draft);
        return draft;
    }

    private DatasetAsset requireAppendAsset(DatasetVersion draft) {
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(draft.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset workspace version not found or no permission"
                ));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new IllegalArgumentException(
                    "dataset workspace version not found or no permission"
            );
        }
        return asset;
    }

    private void requireAppendSession(
            DatasetUploadSession session,
            String draftVersionId
    ) {
        if (!UPLOAD_PURPOSE_APPEND.equals(session.getUploadPurpose())
                || !Objects.equals(draftVersionId, session.getVersionId())) {
            throw new IllegalArgumentException(
                    "append upload session does not belong to draft version"
            );
        }
        String taskType = DatasetTaskType.normalize(session.getType());
        if ("MULTIMODAL".equals(taskType) && !isMultimodalGrouping(session.getSampleGrouping())) {
            throw new IllegalArgumentException(
                    "append upload session sampleGrouping must be MANIFEST or AUTO_DIRECTORY"
            );
        }
        if (!"MULTIMODAL".equals(taskType)
                && (session.getSampleGrouping() != null
                || session.getManifestPath() != null
                || Boolean.TRUE.equals(session.getStrictManifest()))) {
            throw new IllegalArgumentException(
                    "single-modal append upload cannot use sampleGrouping, manifestPath, or strictManifest"
            );
        }
        normalizeStrictManifestForTask(taskType, session.getSampleGrouping(), session.getStrictManifest());
    }

    private DatasetUploadSession claimCompleting(String uploadId) {
        DatasetUploadSession session = getSession(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return session;
        }
        if (STATUS_COMPLETING.equals(session.getStatus())) {
            throw new IllegalArgumentException("数据集文件正在合并中，请稍后查询进度");
        }
        if (!STATUS_UPLOADING.equals(session.getStatus())) {
            throw new IllegalArgumentException("上传状态不允许完成: " + session.getStatus());
        }

        Instant now = Instant.now();
        int updated = sessionRepo.updateStatusIfCurrent(
                session.getId(),
                session.getOwnerUserId(),
                STATUS_UPLOADING,
                STATUS_COMPLETING,
                now
        );
        if (updated == 0) {
            DatasetUploadSession current = getSession(uploadId);
            if (STATUS_COMPLETED.equals(current.getStatus())) {
                return current;
            }
            throw new IllegalArgumentException("数据集文件正在合并中，请稍后查询进度");
        }
        session.setStatus(STATUS_COMPLETING);
        session.setUpdatedAt(now);
        return session;
    }

    private DatasetUploadProgressDto progress(DatasetUploadSession session) {
        boolean completed = STATUS_COMPLETED.equals(session.getStatus());
        UploadChunkProgressSummary summary = completed
                ? null
                : chunkRepo.summarizeProgressByUploadId(session.getId());
        List<Integer> uploadedPartIndexes = completed
                ? completedPartIndexes(session.getTotalChunks())
                : chunkRepo.findPartIndexesByUploadIdOrderByPartIndexAsc(session.getId());
        DatasetUploadProgressDto dto = new DatasetUploadProgressDto();
        dto.setUploadId(session.getId());
        dto.setStatus(session.getStatus());
        dto.setUploadStatus(session.getStatus());
        dto.setVersionStatus(progressVersionStatus(session));
        dto.setImportJobId(session.getImportJobId());
        dto.setImportStatus(importStatus(session.getImportJobId()));
        dto.setFileName(session.getFileName());
        dto.setFileSize(session.getFileSize());
        dto.setChunkSize(session.getChunkSize());
        dto.setTotalChunks(session.getTotalChunks());
        dto.setUploadedChunks(completed ? session.getTotalChunks() : uploadedChunks(summary));
        dto.setUploadedBytes(completed
                ? session.getFileSize()
                : uploadedBytes(summary));
        dto.setUploadedPartIndexes(uploadedPartIndexes);
        dto.setAssetId(session.getAssetId());
        dto.setVersionId(session.getVersionId());
        dto.setVersionNo(session.getVersionNo());
        dto.setVersionLabel(versionAllocationService.displayVersionLabel(
                session.getVersionLabel(),
                session.getVersion(),
                session.getVersionNo()
        ));
        dto.setDescription(session.getDescription());
        dto.setChangeLog(session.getChangeLog());
        dto.setParentVersionId(session.getParentVersionId());
        dto.setCvTaskType(session.getCvTaskType());
        dto.setAnnotationFormat(session.getAnnotationFormat());
        dto.setStrictManifest(Boolean.TRUE.equals(session.getStrictManifest()));
        dto.setCreatedAt(session.getCreatedAt());
        dto.setUpdatedAt(session.getUpdatedAt());
        return dto;
    }

    private String progressVersionStatus(DatasetUploadSession session) {
        if (session.getVersionId() == null || session.getVersionId().isBlank()) {
            return null;
        }
        return isMultimodalImportUpload(session)
                ? VERSION_STATUS_DRAFT
                : VERSION_STATUS_READY;
    }

    private String importStatus(String importJobId) {
        if (importJobId == null || importJobId.isBlank() || importJobRepo == null) {
            return null;
        }
        return importJobRepo.findById(importJobId)
                .map(ImportJob::getStatus)
                .orElse(null);
    }

    private List<Integer> completedPartIndexes(Integer totalChunks) {
        List<Integer> indexes = new ArrayList<>();
        for (int i = 0; i < totalChunks; i += 1) {
            indexes.add(i);
        }
        return indexes;
    }

    private int uploadedChunks(UploadChunkProgressSummary summary) {
        Long value = summary == null ? null : summary.getUploadedChunks();
        return value == null ? 0 : Math.toIntExact(value);
    }

    private long uploadedBytes(UploadChunkProgressSummary summary) {
        Long value = summary == null ? null : summary.getUploadedBytes();
        return value == null ? 0L : value;
    }

    private DatasetUploadCompleteResponse completedPayload(DatasetUploadSession session) {
        DatasetUploadCompleteResponse data = new DatasetUploadCompleteResponse();
        data.setUploadId(session.getId());
        data.setId(session.getVersionId());
        data.setAssetId(session.getAssetId());
        data.setName(session.getDatasetName());
        data.setVersion(session.getVersion());
        data.setVersionNo(session.getVersionNo());
        data.setVersionLabel(versionAllocationService.displayVersionLabel(
                session.getVersionLabel(),
                session.getVersion(),
                session.getVersionNo()
        ));
        data.setDescription(session.getDescription());
        data.setChangeLog(session.getChangeLog());
        data.setParentVersionId(session.getParentVersionId());
        data.setType(session.getType());
        data.setCvTaskType(session.getCvTaskType());
        data.setAnnotationFormat(session.getAnnotationFormat());
        data.setRemark(session.getRemark());
        data.setFileName(session.getFileName());
        data.setSizeBytes(session.getFileSize());
        data.setStatus(session.getStatus());
        data.setUploadStatus(session.getStatus());
        data.setDatasetVersionId(session.getVersionId());
        data.setVersionStatus(isMultimodalImportUpload(session)
                ? VERSION_STATUS_DRAFT
                : VERSION_STATUS_READY);
        data.setImportJobId(session.getImportJobId());
        data.setStrictManifest(Boolean.TRUE.equals(session.getStrictManifest()));
        data.setImportStatus(importStatus(session.getImportJobId()));
        data.setOwnerUserId(session.getOwnerUserId());
        data.setCreatedAt(session.getCreatedAt());
        data.setUpdatedAt(session.getUpdatedAt());
        return data;
    }

    private DatasetAppendPackageCompleteResponse appendCompletedPayload(DatasetUploadSession session) {
        if (session.getImportJobId() == null || session.getImportJobId().isBlank()) {
            throw new IllegalArgumentException("append upload has no import job");
        }
        ImportJob job = importJobRepo.findById(session.getImportJobId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "append import job not found: " + session.getImportJobId()
                ));
        if (job.getPackageId() == null || job.getPackageId().isBlank()) {
            throw new IllegalArgumentException("append import job has no package");
        }
        DatasetVersionPackage relation = versionPackageRepo
                .findByDatasetVersionIdAndPackageId(
                        session.getVersionId(),
                        job.getPackageId()
                )
                .orElseThrow(() -> new IllegalArgumentException(
                        "append package is not linked to draft version"
                ));

        DatasetAppendPackageCompleteResponse data = new DatasetAppendPackageCompleteResponse();
        data.setUploadId(session.getId());
        data.setDraftVersionId(session.getVersionId());
        data.setDatasetVersionId(session.getVersionId());
        data.setPackageId(job.getPackageId());
        data.setPackageRole(relation.getPackageRole());
        data.setPackageOrder(relation.getPackageOrder());
        data.setImportJobId(job.getId());
        data.setStrictManifest(Boolean.TRUE.equals(session.getStrictManifest()));
        data.setUploadStatus(session.getStatus());
        data.setVersionStatus(VERSION_STATUS_DRAFT);
        data.setImportStatus(job.getStatus());
        return data;
    }

    private DatasetCvFolderUploadResponse completedPayload(
            String uploadId,
            String assetId,
            String versionId,
            String datasetName,
            String version,
            Integer versionNo,
            String versionLabel,
            String description,
            String changeLog,
            String parentVersionId,
            String type,
            String cvTaskType,
            String annotationFormat,
            String remark,
            String fileName,
            String storagePath,
            Long sizeBytes,
            Integer ownerUserId,
            Instant createdAt,
            Instant updatedAt
    ) {
        DatasetCvFolderUploadResponse data = new DatasetCvFolderUploadResponse();
        data.setUploadId(uploadId);
        data.setId(versionId);
        data.setAssetId(assetId);
        data.setName(datasetName);
        data.setVersion(version);
        data.setVersionNo(versionNo);
        data.setVersionLabel(versionAllocationService.displayVersionLabel(versionLabel, version, versionNo));
        data.setDescription(description);
        data.setChangeLog(changeLog);
        data.setParentVersionId(parentVersionId);
        data.setType(type);
        data.setCvTaskType(cvTaskType);
        data.setAnnotationFormat(annotationFormat);
        data.setRemark(remark);
        data.setFileName(fileName);
        data.setSizeBytes(sizeBytes);
        data.setStatus(STATUS_COMPLETED);
        data.setOwnerUserId(ownerUserId);
        data.setCreatedAt(createdAt);
        data.setUpdatedAt(updatedAt);
        return data;
    }

    private int writeCvFolderZip(
            Path tempZip,
            List<MultipartFile> files,
            List<String> paths,
            String annotationFormat
    ) throws Exception {
        int imageCount = 0;
        Set<String> entryNames = new LinkedHashSet<>();
        try (OutputStream os = Files.newOutputStream(tempZip);
             ZipOutputStream zip = new ZipOutputStream(os)) {
            for (int i = 0; i < files.size(); i += 1) {
                MultipartFile file = files.get(i);
                if (file == null || file.isEmpty()) {
                    throw new IllegalArgumentException("图片文件不能为空");
                }
                String entryName = sanitizeZipEntryPath(paths.get(i), file.getOriginalFilename());
                String ext = extensionOf(entryName);
                if (!CvAnnotationFormat.isAllowedFile(annotationFormat, ext)) {
                    throw new IllegalArgumentException(
                            "CV folder upload does not allow file for annotationFormat "
                                    + annotationFormat + ": " + entryName
                    );
                }
                if (!entryNames.add(entryName)) {
                    throw new IllegalArgumentException("图片文件夹中存在重复路径: " + entryName);
                }

                ZipEntry entry = new ZipEntry(entryName);
                entry.setTime(System.currentTimeMillis());
                zip.putNextEntry(entry);
                try (InputStream input = file.getInputStream()) {
                    input.transferTo(zip);
                }
                zip.closeEntry();
                if (DatasetZipValidator.isCvImageExtension(ext)) {
                    imageCount += 1;
                }
            }
        }
        return imageCount;
    }

    private String sanitizeZipEntryPath(String rawPath, String fallbackName) {
        String path = normalizeText(rawPath);
        if (path == null) {
            path = normalizeText(fallbackName);
        }
        if (path == null) {
            throw new IllegalArgumentException("图片文件路径不能为空");
        }
        String normalized = path.replace('\\', '/');
        if (normalized.startsWith("/") || normalized.matches("^[A-Za-z]:.*")) {
            throw new IllegalArgumentException("图片文件路径非法: " + path);
        }
        List<String> parts = new ArrayList<>();
        for (String part : normalized.split("/")) {
            if (part == null || part.isBlank() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part) || part.contains("\u0000")) {
                throw new IllegalArgumentException("图片文件路径非法: " + path);
            }
            parts.add(sanitizeZipSegment(part));
        }
        if (parts.isEmpty()) {
            throw new IllegalArgumentException("图片文件路径不能为空");
        }
        return String.join("/", parts);
    }

    private String sanitizeZipSegment(String value) {
        String segment = value.trim().replaceAll("[\\\\:*?\"<>|]", "_");
        return segment.isEmpty() ? "unnamed" : segment;
    }

    private void removeObjectQuietly(String objectName) {
        removeObjectQuietly(objectName, null);
    }

    private void removeObjectQuietly(String objectName, String uploadId) {
        if (objectName == null || objectName.isBlank()) {
            return;
        }
        try {
            minioDeleteTaskService.enqueueDefaultBucketDeleteImmediately(
                    objectName,
                    MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_ROLLBACK,
                    objectName,
                    null
            );
        } catch (Exception exception) {
            log.warn(
                    "Dataset upload rollback delete enqueue failed: uploadId={}, exceptionType={}",
                    uploadId,
                    exception.getClass().getSimpleName()
            );
        }
    }

    private void registerChunkCleanup(String uploadId, List<DatasetUploadChunk> chunks) {
        List<DatasetUploadChunk> cleanupChunks = new ArrayList<>(chunks);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cleanupChunks(uploadId, cleanupChunks);
                }
            });
            return;
        }
        cleanupChunks(uploadId, cleanupChunks);
    }

    private void cleanupChunks(String uploadId, List<DatasetUploadChunk> chunks) {
        int enqueued = 0;
        int metadataDeleted = 0;
        for (DatasetUploadChunk chunk : chunks) {
            try {
                minioDeleteTaskService.enqueueDefaultBucketDeleteImmediately(
                        chunk.getObjectName(),
                        MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_CHUNK,
                        uploadId,
                        null
                );
                enqueued += 1;
            } catch (Exception exception) {
                log.warn(
                        "Dataset upload chunk cleanup enqueue failed: uploadId={}, exceptionType={}",
                        uploadId,
                        exception.getClass().getSimpleName()
                );
                continue;
            }
            try {
                chunkRepo.deleteByIdImmediately(chunk.getId());
                metadataDeleted += 1;
            } catch (Exception exception) {
                log.warn(
                        "Dataset upload chunk metadata cleanup failed: uploadId={}, partIndex={}, exceptionType={}",
                        uploadId,
                        chunk.getPartIndex(),
                        exception.getClass().getSimpleName()
                );
            }
        }
        log.info(
                "Dataset upload chunk cleanup processed: uploadId={}, chunkCount={}, enqueuedCount={}, metadataDeletedCount={}",
                uploadId,
                chunks.size(),
                enqueued,
                metadataDeleted
        );
    }

    private boolean sameUpload(
            DatasetUploadSession session,
            DatasetUploadInitRequest req,
            String taskType,
            String resolvedParentVersionId
    ) {
        String cvTaskType = CvTaskType.normalizeForTask(taskType, req.getCvTaskType());
        String annotationFormat = CvAnnotationFormat.normalizeForTask(taskType, req.getAnnotationFormat());
        String requestAssetId = normalizeText(req.getAssetId());
        String requestLabel = versionAllocationService.defaultVersionLabel(
                req.getVersionLabel(),
                req.getVersion(),
                requestAssetId == null ? 1 : session.getVersionNo()
        );
        boolean requestLabelGenerated = versionAllocationService.isVersionLabelGenerated(
                req.getVersionLabel(),
                req.getVersion()
        );
        String requestSampleGrouping = normalizeSampleGroupingForTask(taskType, req.getSampleGrouping());
        String requestManifestPath = normalizeManifestPath(
                requestSampleGrouping,
                req.getManifestPath()
        );
        boolean requestStrictManifest = normalizeStrictManifestForTask(
                taskType,
                requestSampleGrouping,
                req.getStrictManifest()
        );
        return session.getFileName().equals(req.getFileName().trim())
                && session.getFileSize().equals(req.getFileSize())
                && Objects.equals(session.getAssetId(), requestAssetId)
                && (requestAssetId != null || session.getDatasetName().equals(req.getDatasetName().trim()))
                && Objects.equals(
                        versionAllocationService.displayVersionLabel(
                                session.getVersionLabel(),
                                session.getVersion(),
                                session.getVersionNo()
                        ),
                        requestLabel
                )
                && Boolean.TRUE.equals(session.getVersionLabelGenerated()) == requestLabelGenerated
                && session.getType().equals(taskType)
                && equalsNullable(session.getCvTaskType(), cvTaskType)
                && equalsNullable(session.getAnnotationFormat(), annotationFormat)
                && equalsNullable(session.getDescription(), req.getDescription())
                && equalsNullable(session.getChangeLog(), req.getChangeLog())
                && equalsNullable(session.getParentVersionId(), resolvedParentVersionId)
                && equalsNullable(session.getSampleGrouping(), requestSampleGrouping)
                && equalsNullable(session.getManifestPath(), requestManifestPath)
                && Boolean.TRUE.equals(session.getStrictManifest()) == requestStrictManifest;
    }

    private boolean equalsNullable(String left, String right) {
        return left == null ? right == null : left.equals(right);
    }

    private String normalizeText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
    }

    private void validateDatasetFileName(String taskType, String fileName) {
        validateDatasetFileNameForTask(taskType, fileName);
    }

    static void validateDatasetFileNameForTask(String taskType, String fileName) {
        DatasetZipValidator.validateDatasetFileNameForTask(taskType, fileName);
    }

    static void validateAppendPackageFileNameForTask(String taskType, String fileName) {
        DatasetZipValidator.validateAppendPackageFileNameForTask(taskType, fileName);
    }

    static String normalizeSampleGrouping(String value) {
        String normalized = value == null || value.isBlank()
                ? null
                : value.trim().toUpperCase(Locale.ROOT);
        if (normalized != null
                && !GROUPING_MANIFEST.equals(normalized)
                && !GROUPING_AUTO_DIRECTORY.equals(normalized)) {
            throw new IllegalArgumentException(
                    "sampleGrouping 仅支持 MANIFEST 或 AUTO_DIRECTORY"
            );
        }
        return normalized;
    }

    static String normalizeSampleGroupingForTask(String taskType, String value) {
        String normalized = normalizeSampleGrouping(value);
        if ("MULTIMODAL".equals(taskType) && normalized == null) {
            return GROUPING_AUTO_DIRECTORY;
        }
        return normalized;
    }

    static String normalizeManifestPath(String sampleGrouping, String value) {
        String normalized = value == null || value.isBlank()
                ? null
                : value.trim().replace('\\', '/');
        if (GROUPING_AUTO_DIRECTORY.equals(sampleGrouping)) {
            if (normalized != null) {
                throw new IllegalArgumentException(
                        "AUTO_DIRECTORY 不允许传 manifestPath"
                );
            }
            return null;
        }
        if (!GROUPING_MANIFEST.equals(sampleGrouping)) {
            if (normalized != null) {
                throw new IllegalArgumentException(
                        "manifestPath 仅在 sampleGrouping=MANIFEST 时可用"
                );
            }
            return null;
        }
        if (normalized == null) {
            return "manifest.json";
        }
        if (normalized.length() > 255
                || normalized.startsWith("/")
                || normalized.matches("^[A-Za-z]:.*")
                || normalized.contains("\u0000")) {
            throw new IllegalArgumentException("manifestPath 非法");
        }
        for (String part : normalized.split("/")) {
            if ("..".equals(part)) {
                throw new IllegalArgumentException("manifestPath 非法");
            }
        }
        return normalized;
    }

    static boolean normalizeStrictManifestForTask(
            String taskType,
            String sampleGrouping,
            Boolean value
    ) {
        boolean strict = Boolean.TRUE.equals(value);
        if (!strict) {
            return false;
        }
        if (!"MULTIMODAL".equals(taskType)) {
            throw new IllegalArgumentException(
                    "strictManifest 仅 MULTIMODAL + MANIFEST 支持"
            );
        }
        if (!GROUPING_MANIFEST.equals(sampleGrouping)) {
            throw new IllegalArgumentException(
                    "strictManifest 仅在 sampleGrouping=MANIFEST 时可用"
            );
        }
        return true;
    }

    static int calculateChunkSize(long fileSize) {
        long sizeRequiredByPartLimit = ((fileSize - 1) / MAX_COMPOSE_SOURCES) + 1;
        long rawChunkSize = Math.max(MIN_CHUNK_SIZE, sizeRequiredByPartLimit);
        long roundedChunkSize = ((rawChunkSize + CHUNK_SIZE_GRANULARITY - 1) / CHUNK_SIZE_GRANULARITY)
                * CHUNK_SIZE_GRANULARITY;
        if (roundedChunkSize > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("fileSize 过大，无法生成有效分片");
        }
        return (int) roundedChunkSize;
    }

    static int calculateTotalChunks(long fileSize, int chunkSize) {
        long totalChunks = ((fileSize - 1) / chunkSize) + 1;
        if (totalChunks > MAX_COMPOSE_SOURCES) {
            throw new IllegalArgumentException("分片数量不能超过 " + MAX_COMPOSE_SOURCES);
        }
        return (int) totalChunks;
    }

    private static void validateGroupingForTask(String taskType, String sampleGrouping) {
        if ("MULTIMODAL".equals(taskType) && !isMultimodalGrouping(sampleGrouping)) {
            throw new IllegalArgumentException(
                    "MULTIMODAL 数据集必须使用 sampleGrouping=MANIFEST 或 AUTO_DIRECTORY"
            );
        }
        if (!"MULTIMODAL".equals(taskType) && sampleGrouping != null) {
            throw new IllegalArgumentException(
                    "仅 MULTIMODAL 数据集支持 sampleGrouping"
            );
        }
    }

    private static boolean isMultimodalGrouping(String sampleGrouping) {
        return GROUPING_MANIFEST.equals(sampleGrouping)
                || GROUPING_AUTO_DIRECTORY.equals(sampleGrouping);
    }

    private Long validateDatasetObjectFormat(
            String taskType,
            String annotationFormat,
            String fileName,
            String objectName,
            long objectSize
    ) throws Exception {
        return datasetZipValidator.validateDatasetObjectFormat(
                taskType,
                annotationFormat,
                fileName,
                objectName,
                objectSize
        );
    }

    static long validateDatasetZipEntries(
            String taskType,
            String annotationFormat,
            InputStream inputStream
    ) throws Exception {
        return DatasetZipValidator.validateDatasetZipEntries(
                taskType,
                annotationFormat,
                inputStream
        );
    }

    private static String extensionOf(String name) {
        return DatasetZipValidator.extensionOf(name);
    }

    private String rootMessage(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        return current.getMessage() == null ? e.getMessage() : current.getMessage();
    }

    private boolean isOneActiveDraftViolation(Throwable exception) {
        Throwable current = exception;
        while (current != null) {
            if (current instanceof org.hibernate.exception.ConstraintViolationException constraint
                    && "uk_dataset_version_one_active_draft".equalsIgnoreCase(constraint.getConstraintName())) {
                return true;
            }
            String message = current.getMessage();
            if (message != null
                    && message.toLowerCase(Locale.ROOT)
                            .contains("uk_dataset_version_one_active_draft")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    static String manifestDestinationObject(DatasetUploadSession session) {
        return manifestDestinationObject(
                session.getOwnerUserId(),
                session.getAssetId(),
                session.getVersionNo(),
                session.getFileName()
        );
    }

    static String appendPackageDestinationObject(DatasetUploadSession session) {
        if (session.getOwnerUserId() == null
                || session.getAssetId() == null || session.getAssetId().isBlank()
                || session.getVersionNo() == null
                || session.getId() == null || session.getId().isBlank()
                || session.getFileName() == null || session.getFileName().isBlank()) {
            throw new IllegalArgumentException("append upload session is incomplete");
        }
        return "users/" + session.getOwnerUserId()
                + "/datasets/" + session.getAssetId()
                + "/" + sanitizeSegment("v" + session.getVersionNo())
                + "/packages/" + sanitizeSegment(session.getId())
                + "/" + sanitizeSegment(session.getFileName());
    }

    private static String manifestDestinationObject(
            Integer ownerUserId,
            String assetId,
            Integer versionNo,
            String fileName
    ) {
        if (ownerUserId == null
                || assetId == null || assetId.isBlank()
                || versionNo == null
                || fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException("manifest upload reservation is incomplete");
        }
        return "users/" + ownerUserId
                + "/datasets/" + assetId + "/" + sanitizeSegment("v" + versionNo)
                + "/" + sanitizeSegment(fileName);
    }

    private static String sanitizeSegment(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            return "unnamed";
        }
        return normalized
                .replaceAll("[\\\\/:*?\"<>|]", "_")
                .toLowerCase(Locale.ROOT);
    }

    private record AppendCompletionClaim(
            DatasetUploadSession session,
            List<DatasetUploadChunk> chunks
    ) {
    }

    private record ManifestReservation(
            DatasetUploadSession session,
            String destinationObject,
            List<DatasetUploadChunk> chunks
    ) {
    }
}
