package com.tss.platform.service;

import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import io.minio.StatObjectResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class DatasetUploadRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(DatasetUploadRecoveryService.class);
    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETING = "COMPLETING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final Duration STALE_AFTER = Duration.ofMinutes(30);

    private final DatasetUploadSessionRepository sessionRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final ImportJobRepository jobRepo;
    private final MinioService minioService;
    private final MinioDeleteTaskService deleteTaskService;
    private final ImportJobLauncher launcher;
    private final TransactionTemplate transactionTemplate;

    public DatasetUploadRecoveryService(
            DatasetUploadSessionRepository sessionRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            ImportJobRepository jobRepo,
            MinioService minioService,
            MinioDeleteTaskService deleteTaskService,
            ImportJobLauncher launcher,
            PlatformTransactionManager transactionManager
    ) {
        this.sessionRepo = sessionRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.jobRepo = jobRepo;
        this.minioService = minioService;
        this.deleteTaskService = deleteTaskService;
        this.launcher = launcher;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public void recoverStaleSessions() {
        Instant cutoff = Instant.now().minus(STALE_AFTER);
        for (DatasetUploadSession session :
                sessionRepo.findByStatusAndUpdatedAtBefore(STATUS_COMPLETING, cutoff)) {
            try {
                recover(session.getId());
            } catch (RuntimeException exception) {
                log.warn(
                        "Unable to recover dataset upload session {}: {}",
                        session.getId(),
                        exception.getMessage()
                );
            }
        }
    }

    public void recover(String uploadId) {
        RecoverySnapshot snapshot = transactionTemplate.execute(status ->
                sessionRepo.findByIdForUpdate(uploadId)
                        .filter(session -> STATUS_COMPLETING.equals(session.getStatus()))
                        .map(this::snapshot)
                        .orElse(null)
        );
        if (snapshot == null) {
            return;
        }

        boolean objectExists = false;
        boolean sizeMatches = false;
        long objectSize = 0L;
        try {
            StatObjectResponse stat = minioService.stat(snapshot.objectName());
            objectExists = true;
            objectSize = stat.size();
            sizeMatches = objectSize == snapshot.expectedSize();
        } catch (Exception ignored) {
            // A missing or unreadable reserved object is rolled back to UPLOADING.
        }

        if (!sizeMatches) {
            rollbackReservation(snapshot);
            if (objectExists) {
                deleteTaskService.enqueueDefaultBucketDeleteImmediately(
                        snapshot.objectName(),
                        MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_ROLLBACK,
                        snapshot.uploadId(),
                        snapshot.ownerUserId()
                );
            }
            return;
        }

        long recoveredObjectSize = objectSize;
        String importJobId = transactionTemplate.execute(status ->
                finalizeRecoveredUpload(snapshot, recoveredObjectSize)
        );
        if (importJobId != null) {
            launcher.launch(importJobId);
        }
    }

    private RecoverySnapshot snapshot(DatasetUploadSession session) {
        return new RecoverySnapshot(
                session.getId(),
                session.getVersionId(),
                session.getAssetId(),
                Boolean.TRUE.equals(session.getAssetCreatedByUpload()),
                session.getOwnerUserId(),
                session.getFileSize(),
                DatasetUploadService.manifestDestinationObject(session)
        );
    }

    private String finalizeRecoveredUpload(RecoverySnapshot snapshot, long objectSize) {
        DatasetUploadSession session = sessionRepo.findByIdForUpdate(snapshot.uploadId())
                .orElse(null);
        if (session == null || !STATUS_COMPLETING.equals(session.getStatus())) {
            return null;
        }
        if (!snapshot.versionId().equals(session.getVersionId())
                || !snapshot.assetId().equals(session.getAssetId())) {
            return null;
        }

        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(snapshot.versionId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset version not found: " + snapshot.versionId()
                ));
        if (!"DRAFT".equals(version.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset version must be DRAFT: " + version.getId()
            );
        }

        Instant now = Instant.now();
        version.setFileName(session.getFileName());
        version.setStoragePath(snapshot.objectName());
        version.setSizeBytes(objectSize);
        versionRepo.saveAndFlush(version);

        ImportJob job = jobRepo.findByDatasetVersionId(version.getId())
                .orElseGet(() -> {
                    ImportJob value = new ImportJob();
                    value.setId("ijob-" + UUID.randomUUID().toString().replace("-", ""));
                    value.setDatasetVersionId(version.getId());
                    value.setStatus("PENDING");
                    value.setProgress(0);
                    value.setImportedSamples(0);
                    value.setOwnerUserId(session.getOwnerUserId());
                    value.setCreatedAt(now);
                    value.setUpdatedAt(now);
                    return jobRepo.saveAndFlush(value);
                });

        session.setStoragePath(snapshot.objectName());
        session.setImportJobId(job.getId());
        session.setStatus(STATUS_COMPLETED);
        session.setUpdatedAt(now);
        sessionRepo.saveAndFlush(session);
        return "PENDING".equals(job.getStatus()) ? job.getId() : null;
    }

    private void rollbackReservation(RecoverySnapshot snapshot) {
        transactionTemplate.executeWithoutResult(status -> {
            DatasetUploadSession session = sessionRepo.findByIdForUpdate(snapshot.uploadId())
                    .orElse(null);
            if (session == null || !STATUS_COMPLETING.equals(session.getStatus())) {
                return;
            }
            if (!snapshot.versionId().equals(session.getVersionId())
                    || !snapshot.assetId().equals(session.getAssetId())) {
                return;
            }

            DatasetVersion version = versionRepo.findByIdAndDeletedFalse(snapshot.versionId())
                    .orElse(null);
            session.setStatus(STATUS_UPLOADING);
            session.setStoragePath(null);
            session.setVersionId(null);
            session.setVersionNo(null);
            session.setImportJobId(null);
            if (snapshot.assetCreatedByUpload()) {
                session.setAssetId(null);
            }
            session.setAssetCreatedByUpload(false);
            session.setUpdatedAt(Instant.now());
            sessionRepo.saveAndFlush(session);

            if (version != null) {
                versionRepo.delete(version);
                versionRepo.flush();
            }
            if (snapshot.assetCreatedByUpload()
                    && versionRepo.countByAssetIdAndDeletedFalse(snapshot.assetId()) == 0) {
                assetRepo.findById(snapshot.assetId())
                        .filter(asset -> asset.getCurrentVersionId() == null)
                        .ifPresent(assetRepo::delete);
            }
        });
    }

    private record RecoverySnapshot(
            String uploadId,
            String versionId,
            String assetId,
            boolean assetCreatedByUpload,
            Integer ownerUserId,
            long expectedSize,
            String objectName
    ) {
    }
}
