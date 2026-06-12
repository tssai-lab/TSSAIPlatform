package com.tss.platform.service;

import com.tss.platform.entity.DatasetAnnotation;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetSampleData;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.model.manifest.ManifestAnnotation;
import com.tss.platform.model.manifest.ManifestData;
import com.tss.platform.model.manifest.ManifestImportPlan;
import com.tss.platform.model.manifest.ManifestSample;
import com.tss.platform.repository.DatasetAnnotationRepository;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import io.minio.StatObjectResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ImportJobService {

    private static final String JOB_PENDING = "PENDING";
    private static final String JOB_RUNNING = "RUNNING";
    private static final String JOB_SUCCESS = "SUCCESS";
    private static final String JOB_FAILED = "FAILED";
    private static final String VERSION_DRAFT = "DRAFT";
    private static final String VERSION_READY = "READY";

    private final ImportJobRepository jobRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final DatasetUploadSessionRepository sessionRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetSampleDataRepository dataRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final MinioService minioService;
    private final ZipCentralDirectoryReader zipReader;
    private final ManifestZipReader manifestReader;
    private final ManifestParser manifestParser;
    private final TransactionTemplate writeTransaction;
    private final TransactionTemplate statusTransaction;
    private final Map<String, String> activeExecutors = new ConcurrentHashMap<>();

    public ImportJobService(
            ImportJobRepository jobRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            DatasetUploadSessionRepository sessionRepo,
            DatasetSampleRepository sampleRepo,
            DatasetSampleDataRepository dataRepo,
            DatasetAnnotationRepository annotationRepo,
            MinioService minioService,
            ZipCentralDirectoryReader zipReader,
            ManifestZipReader manifestReader,
            ManifestParser manifestParser,
            PlatformTransactionManager transactionManager
    ) {
        this.jobRepo = jobRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.sessionRepo = sessionRepo;
        this.sampleRepo = sampleRepo;
        this.dataRepo = dataRepo;
        this.annotationRepo = annotationRepo;
        this.minioService = minioService;
        this.zipReader = zipReader;
        this.manifestReader = manifestReader;
        this.manifestParser = manifestParser;
        this.writeTransaction = new TransactionTemplate(transactionManager);
        this.statusTransaction = new TransactionTemplate(transactionManager);
        this.statusTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void execute(String importJobId) {
        if (importJobId == null || importJobId.isBlank()) {
            throw new IllegalArgumentException("importJobId cannot be blank");
        }
        String executorId = "executor-" + UUID.randomUUID().toString().replace("-", "");
        Boolean claimed = statusTransaction.execute(status ->
                jobRepo.claimPending(importJobId, JOB_PENDING, JOB_RUNNING, executorId, Instant.now()) == 1
        );
        if (!Boolean.TRUE.equals(claimed)) {
            throw new IllegalArgumentException("import job is not claimable: " + importJobId);
        }
        activeExecutors.put(importJobId, executorId);

        try {
            ImportContext context = loadContext(importJobId, executorId);
            StatObjectResponse stat = minioService.stat(context.objectName());
            long objectSize = stat.size();
            List<ZipEntryInfo> entries = zipReader.read(context.objectName(), objectSize);
            String manifestJson = manifestReader.readManifest(
                    context.objectName(),
                    objectSize,
                    context.manifestPath()
            );
            ManifestImportPlan plan = manifestParser.parse(
                    manifestJson,
                    entries,
                    context.manifestPath()
            );
            writeTransaction.executeWithoutResult(status -> persistPlan(context, plan, executorId));
        } catch (Exception exception) {
            String message = rootMessage(exception);
            statusTransaction.executeWithoutResult(status -> markFailed(importJobId, executorId, message));
        } finally {
            activeExecutors.remove(importJobId, executorId);
        }
    }

    void heartbeatActiveJobs() {
        Instant now = Instant.now();
        for (Map.Entry<String, String> lease : activeExecutors.entrySet()) {
            Integer updated = statusTransaction.execute(status ->
                    jobRepo.updateHeartbeatIfOwned(
                            lease.getKey(),
                            lease.getValue(),
                            JOB_RUNNING,
                            now
                    )
            );
            if (updated == null || updated != 1) {
                activeExecutors.remove(lease.getKey(), lease.getValue());
            }
        }
    }

    private ImportContext loadContext(String importJobId, String executorId) {
        ImportJob job = jobRepo.findById(importJobId)
                .orElseThrow(() -> new IllegalArgumentException("import job not found: " + importJobId));
        if (!JOB_RUNNING.equals(job.getStatus()) || !executorId.equals(job.getExecutorId())) {
            throw new IllegalArgumentException(
                    "import job lease was lost: " + importJobId
            );
        }
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(job.getDatasetVersionId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset version not found: " + job.getDatasetVersionId()
                ));
        if (!VERSION_DRAFT.equals(version.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset version must be DRAFT: " + version.getId() + ", status=" + version.getStatus()
            );
        }
        if (version.getStoragePath() == null || version.getStoragePath().isBlank()) {
            throw new IllegalArgumentException("dataset version storagePath is blank: " + version.getId());
        }
        DatasetUploadSession session = sessionRepo.findByImportJobId(importJobId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "upload session not found for import job: " + importJobId
                ));
        if (!version.getId().equals(session.getVersionId())) {
            throw new IllegalArgumentException("upload session version does not match import job");
        }
        if (!"MANIFEST".equals(session.getSampleGrouping())) {
            throw new IllegalArgumentException("upload session sampleGrouping must be MANIFEST");
        }

        return new ImportContext(
                importJobId,
                version.getId(),
                version.getAssetId(),
                version.getStoragePath(),
                session.getManifestPath()
        );
    }

    private void persistPlan(ImportContext context, ManifestImportPlan plan, String executorId) {
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(context.versionId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset version not found: " + context.versionId()
                ));
        if (!VERSION_DRAFT.equals(version.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset version must remain DRAFT during import: " + version.getId()
            );
        }
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalseForUpdate(context.assetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset asset not found: " + context.assetId()
                ));

        Instant now = Instant.now();
        List<DatasetSample> samples = new ArrayList<>(plan.totalSamples());
        List<DatasetSampleData> dataItems = new ArrayList<>(plan.totalDataCount());
        List<DatasetAnnotation> annotations = new ArrayList<>(plan.totalAnnotationCount());

        for (ManifestSample manifestSample : plan.samples()) {
            DatasetSample sample = toSample(version, manifestSample, now);
            samples.add(sample);

            Map<String, DatasetSampleData> dataByPath = new LinkedHashMap<>();
            for (ManifestData manifestData : manifestSample.data()) {
                DatasetSampleData data = toSampleData(version, sample, manifestData, now);
                dataItems.add(data);
                dataByPath.put(manifestData.path(), data);
            }
            for (ManifestAnnotation manifestAnnotation : manifestSample.annotations()) {
                DatasetSampleData referencedData = manifestAnnotation.refDataPath() == null
                        ? null
                        : dataByPath.get(manifestAnnotation.refDataPath());
                if (manifestAnnotation.refDataPath() != null && referencedData == null) {
                    throw new IllegalArgumentException(
                            "refDataPath not found while persisting sample "
                                    + manifestSample.externalId() + ": "
                                    + manifestAnnotation.refDataPath()
                    );
                }
                annotations.add(toAnnotation(
                        version,
                        sample,
                        referencedData,
                        manifestAnnotation,
                        now
                ));
            }
        }

        sampleRepo.saveAllAndFlush(samples);
        dataRepo.saveAllAndFlush(dataItems);
        annotationRepo.saveAllAndFlush(annotations);

        int completed = jobRepo.completeSuccessIfOwned(
                context.importJobId(),
                executorId,
                JOB_RUNNING,
                plan.totalSamples(),
                now,
                now
        );
        if (completed != 1) {
            throw new IllegalStateException("import job lease was lost before SUCCESS");
        }

        version.setStatus(VERSION_READY);
        version.setPublishedAt(now);
        versionRepo.saveAndFlush(version);

        if (shouldUpdateCurrentVersion(asset, version)) {
            asset.setCurrentVersionId(version.getId());
            asset.setUpdatedAt(now);
            assetRepo.saveAndFlush(asset);
        }
    }

    private boolean shouldUpdateCurrentVersion(DatasetAsset asset, DatasetVersion candidate) {
        String currentVersionId = asset.getCurrentVersionId();
        if (currentVersionId == null || currentVersionId.isBlank()) {
            return true;
        }
        DatasetVersion current = versionRepo.findByIdAndDeletedFalse(currentVersionId).orElse(null);
        if (current == null || current.getVersionNo() == null || candidate.getVersionNo() == null) {
            return false;
        }
        return current.getVersionNo() < candidate.getVersionNo();
    }

    private void markFailed(String importJobId, String executorId, String errorMessage) {
        Instant now = Instant.now();
        int failed = jobRepo.markFailedIfOwned(
                importJobId,
                executorId,
                JOB_RUNNING,
                truncateError(errorMessage),
                now
        );
        if (failed != 1) {
            return;
        }
        jobRepo.findById(importJobId).ifPresent(job ->
                versionRepo.findByIdAndDeletedFalse(job.getDatasetVersionId()).ifPresent(version -> {
            version.setStatus(VERSION_DRAFT);
            version.setPublishedAt(null);
            versionRepo.saveAndFlush(version);
                })
        );
    }

    private static DatasetSample toSample(
            DatasetVersion version,
            ManifestSample source,
            Instant now
    ) {
        DatasetSample target = new DatasetSample();
        target.setId(id("sample"));
        target.setDatasetVersionId(version.getId());
        target.setExternalId(source.externalId());
        target.setSampleIndex(source.sampleIndex());
        target.setTags(source.tags());
        target.setMetadata(source.metadata());
        target.setOwnerUserId(version.getOwnerUserId());
        target.setCreatedAt(now);
        target.setUpdatedAt(now);
        target.setDeleted(false);
        return target;
    }

    private static DatasetSampleData toSampleData(
            DatasetVersion version,
            DatasetSample sample,
            ManifestData source,
            Instant now
    ) {
        ZipEntryInfo entry = source.zipEntryInfo();
        DatasetSampleData target = new DatasetSampleData();
        target.setId(id("data"));
        target.setSampleId(sample.getId());
        target.setDatasetVersionId(version.getId());
        target.setDataType(source.dataType());
        target.setSensor(source.sensor());
        target.setChannel(source.channel());
        target.setSeq(source.seq());
        target.setFormat(source.format());
        target.setOriginalPath(source.path());
        target.setFileName(source.fileName());
        target.setSizeBytes(entry.uncompressedSize());
        target.setContentType(source.contentType());
        applyZipIndex(target, entry);
        target.setMetadata(source.metadata());
        target.setCreatedAt(now);
        target.setUpdatedAt(now);
        return target;
    }

    private static DatasetAnnotation toAnnotation(
            DatasetVersion version,
            DatasetSample sample,
            DatasetSampleData referencedData,
            ManifestAnnotation source,
            Instant now
    ) {
        ZipEntryInfo entry = source.zipEntryInfo();
        DatasetAnnotation target = new DatasetAnnotation();
        target.setId(id("annotation"));
        target.setSampleId(sample.getId());
        target.setSampleDataId(referencedData == null ? null : referencedData.getId());
        target.setDatasetVersionId(version.getId());
        target.setAnnotationType(source.annotationType());
        target.setFormat(source.format());
        target.setOriginalPath(source.path());
        target.setFileName(source.fileName());
        target.setSizeBytes(entry.uncompressedSize());
        target.setContentType(source.contentType());
        target.setZipEntryOffset(entry.localHeaderOffset());
        target.setZipDataOffset(entry.zipDataOffset());
        target.setCompressedSize(entry.compressedSize());
        target.setUncompressedSize(entry.uncompressedSize());
        target.setCompressionMethod(compressionMethod(entry.method()));
        target.setCrc32(entry.crc32());
        target.setMetadata(source.metadata());
        target.setCreatedAt(now);
        return target;
    }

    private static void applyZipIndex(DatasetSampleData target, ZipEntryInfo entry) {
        target.setZipEntryOffset(entry.localHeaderOffset());
        target.setZipDataOffset(entry.zipDataOffset());
        target.setCompressedSize(entry.compressedSize());
        target.setUncompressedSize(entry.uncompressedSize());
        target.setCompressionMethod(compressionMethod(entry.method()));
        target.setCrc32(entry.crc32());
    }

    private static String compressionMethod(int method) {
        return switch (method) {
            case 0 -> "STORED";
            case 8 -> "DEFLATED";
            default -> throw new IllegalArgumentException("unsupported ZIP compression method: " + method);
        };
    }

    private static String id(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "");
    }

    private static String rootMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank()
                ? current.getClass().getSimpleName()
                : message;
    }

    private static String truncateError(String message) {
        if (message == null || message.isBlank()) {
            return "Import failed";
        }
        return message.length() > 4000 ? message.substring(0, 4000) : message;
    }

    private record ImportContext(
            String importJobId,
            String versionId,
            String assetId,
            String objectName,
            String manifestPath
    ) {
    }
}
