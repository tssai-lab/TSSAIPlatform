package com.tss.platform.service;

import com.tss.platform.dto.ImportJobStatusDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.List;
import java.util.Set;

@Service
public class ImportJobQueryService {

    private static final String STATUS_FAILED = "FAILED";
    private static final String STATUS_PENDING = "PENDING";
    private static final Set<String> ACTIVE_RETRY_BLOCKING_STATUSES = Set.of("PENDING", "RUNNING");
    private static final String VERSION_DRAFT = "DRAFT";
    private static final String RETRY_MODE_FULL = "FULL";

    private final ImportJobRepository importJobRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final AuthContext authContext;
    private final ImportJobLauncher importJobLauncher;
    private final DatasetSampleRepository sampleRepo;

    public ImportJobQueryService(
            ImportJobRepository importJobRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            AuthContext authContext,
            ImportJobLauncher importJobLauncher,
            DatasetSampleRepository sampleRepo
    ) {
        this.importJobRepo = importJobRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.authContext = authContext;
        this.importJobLauncher = importJobLauncher;
        this.sampleRepo = sampleRepo;
    }

    @Transactional(readOnly = true)
    public ImportJobStatusDto getStatus(String importJobId) {
        if (importJobId == null || importJobId.isBlank()) {
            throw new IllegalArgumentException("importJobId 不能为空");
        }
        ImportJob job = importJobRepo.findById(importJobId)
                .orElseThrow(() -> new ImportJobAccessException("importJob not found or no permission"));
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(job.getDatasetVersionId())
                .orElseThrow(() -> new ImportJobAccessException("importJob not found or no permission"));
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new ImportJobAccessException("importJob not found or no permission"));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new ImportJobAccessException("importJob not found or no permission");
        }

        return toDto(job);
    }

    @Transactional
    public ImportJobStatusDto retry(String importJobId, String mode) {
        if (importJobId == null || importJobId.isBlank()) {
            throw new IllegalArgumentException("importJobId 不能为空");
        }
        String normalizedMode = mode == null || mode.isBlank()
                ? RETRY_MODE_FULL
                : mode.trim().toUpperCase(java.util.Locale.ROOT);
        if (!RETRY_MODE_FULL.equals(normalizedMode)) {
            throw new ImportJobRetryRejectedException("only FULL retry is supported");
        }

        ImportJob job = importJobRepo.findByIdForUpdate(importJobId)
                .orElseThrow(() -> new ImportJobAccessException("importJob not found or no permission"));
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(job.getDatasetVersionId())
                .orElseThrow(() -> new ImportJobAccessException("importJob not found or no permission"));
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new ImportJobAccessException("importJob not found or no permission"));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new ImportJobAccessException("importJob not found or no permission");
        }
        if (!STATUS_FAILED.equals(job.getStatus())) {
            throw new ImportJobRetryRejectedException("only FAILED ImportJob can be retried");
        }
        if (!VERSION_DRAFT.equals(version.getStatus())) {
            throw new ImportJobRetryRejectedException("ImportJob retry requires DRAFT dataset version");
        }
        if (hasPersistedSamples(job)) {
            throw new ImportJobRetryRejectedException(
                    "ImportJob already has imported samples; upload a new package instead"
            );
        }
        requireNoActiveSiblingJob(job);

        Instant now = Instant.now();
        job.setStatus(STATUS_PENDING);
        job.setProgress(0);
        job.setImportedSamples(0);
        job.setErrorCode(null);
        job.setErrorMessage(null);
        job.setErrorDetailsJson(null);
        job.setExecutorId(null);
        job.setStartedAt(null);
        job.setHeartbeatAt(null);
        job.setFinishedAt(null);
        job.setUpdatedAt(now);
        ImportJob saved = importJobRepo.saveAndFlush(job);
        launchAfterCommit(saved.getId());
        return toDto(saved);
    }

    private boolean hasPersistedSamples(ImportJob job) {
        String packageId = job.getPackageId();
        if (packageId == null || packageId.isBlank()) {
            return sampleRepo.countByDatasetVersionIdAndCreatedByPackageIdIsNull(
                    job.getDatasetVersionId()
            ) > 0;
        }
        return sampleRepo.countByDatasetVersionIdAndCreatedByPackageIdAndDeletedFalse(
                job.getDatasetVersionId(),
                packageId
        ) > 0;
    }

    private void requireNoActiveSiblingJob(ImportJob job) {
        List<ImportJob> jobs = importJobRepo.findByDatasetVersionId(job.getDatasetVersionId());
        if (jobs == null) {
            return;
        }
        boolean hasActiveSibling = jobs.stream()
                .anyMatch(candidate -> !job.getId().equals(candidate.getId())
                        && ACTIVE_RETRY_BLOCKING_STATUSES.contains(candidate.getStatus()));
        if (hasActiveSibling) {
            throw new ImportJobRetryRejectedException(
                    "dataset version already has an active ImportJob; wait for it to finish before retry"
            );
        }
    }

    private void launchAfterCommit(String importJobId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            importJobLauncher.launch(importJobId);
                        }
                    }
            );
            return;
        }
        importJobLauncher.launch(importJobId);
    }

    private static ImportJobStatusDto toDto(ImportJob job) {
        ImportJobStatusDto dto = new ImportJobStatusDto();
        dto.setImportJobId(job.getId());
        dto.setDatasetVersionId(job.getDatasetVersionId());
        dto.setStatus(job.getStatus());
        dto.setProgress(job.getProgress());
        dto.setTotalSamples(job.getTotalSamples());
        dto.setImportedSamples(job.getImportedSamples());
        dto.setErrorCode(job.getErrorCode());
        dto.setErrorMessage(job.getErrorMessage());
        dto.setErrorDetailsJson(job.getErrorDetailsJson());
        dto.setCreatedAt(job.getCreatedAt());
        dto.setStartedAt(job.getStartedAt());
        dto.setFinishedAt(job.getFinishedAt());
        return dto;
    }

    public static class ImportJobAccessException extends IllegalArgumentException {
        public ImportJobAccessException(String message) {
            super(message);
        }
    }

    public static class ImportJobRetryRejectedException extends IllegalArgumentException {
        public ImportJobRetryRejectedException(String message) {
            super(message);
        }
    }
}
