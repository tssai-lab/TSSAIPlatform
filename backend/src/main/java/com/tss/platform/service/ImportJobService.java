package com.tss.platform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.entity.DatasetAnnotation;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetPackage;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetSampleData;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.model.DatasetTaskType;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.model.manifest.ManifestAnnotation;
import com.tss.platform.model.manifest.ManifestData;
import com.tss.platform.model.manifest.ManifestImportPlan;
import com.tss.platform.model.manifest.ManifestSample;
import com.tss.platform.repository.DatasetAnnotationRepository;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetPackageRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.DatasetVersionPackageRepository;
import com.tss.platform.repository.ImportJobRepository;
import io.minio.StatObjectResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class ImportJobService {

    private static final String JOB_PENDING = "PENDING";
    private static final String JOB_RUNNING = "RUNNING";
    private static final String JOB_SUCCESS = "SUCCESS";
    private static final String JOB_FAILED = "FAILED";
    private static final String VERSION_DRAFT = "DRAFT";
    private static final String VERSION_READY = "READY";
    private static final String PACKAGE_ROLE_APPEND = "APPEND";
    private static final String GROUPING_MANIFEST = "MANIFEST";
    private static final String GROUPING_AUTO_DIRECTORY = "AUTO_DIRECTORY";
    private static final ObjectMapper ERROR_DETAILS_MAPPER = new ObjectMapper();

    private final ImportJobRepository jobRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final DatasetPackageRepository packageRepo;
    private final DatasetVersionPackageRepository versionPackageRepo;
    private final DatasetUploadSessionRepository sessionRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetSampleDataRepository dataRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final MinioService minioService;
    private final ZipCentralDirectoryReader zipReader;
    private final ManifestZipReader manifestReader;
    private final ManifestParser manifestParser;
    private final AutoDirectoryManifestBuilder autoDirectoryManifestBuilder;
    private final SingleModalImportPlanBuilder singleModalImportPlanBuilder;
    private final TransactionTemplate writeTransaction;
    private final TransactionTemplate statusTransaction;
    private final Map<String, String> activeExecutors = new ConcurrentHashMap<>();

    public ImportJobService(
            ImportJobRepository jobRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            DatasetPackageRepository packageRepo,
            DatasetVersionPackageRepository versionPackageRepo,
            DatasetUploadSessionRepository sessionRepo,
            DatasetSampleRepository sampleRepo,
            DatasetSampleDataRepository dataRepo,
            DatasetAnnotationRepository annotationRepo,
            MinioService minioService,
            ZipCentralDirectoryReader zipReader,
            ManifestZipReader manifestReader,
            ManifestParser manifestParser,
            AutoDirectoryManifestBuilder autoDirectoryManifestBuilder,
            SingleModalImportPlanBuilder singleModalImportPlanBuilder,
            PlatformTransactionManager transactionManager
    ) {
        this.jobRepo = jobRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.packageRepo = packageRepo;
        this.versionPackageRepo = versionPackageRepo;
        this.sessionRepo = sessionRepo;
        this.sampleRepo = sampleRepo;
        this.dataRepo = dataRepo;
        this.annotationRepo = annotationRepo;
        this.minioService = minioService;
        this.zipReader = zipReader;
        this.manifestReader = manifestReader;
        this.manifestParser = manifestParser;
        this.autoDirectoryManifestBuilder = autoDirectoryManifestBuilder;
        this.singleModalImportPlanBuilder = singleModalImportPlanBuilder;
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
            ManifestImportPlan plan = buildPlan(context, entries, objectSize);
            writeTransaction.executeWithoutResult(status -> persistPlan(context, plan, executorId));
        } catch (Exception exception) {
            log.error(
                    "Import job failed: importJobId={}, executorId={}",
                    importJobId,
                    executorId,
                    exception
            );
            ImportFailure failure = importFailure(exception);
            statusTransaction.executeWithoutResult(
                    status -> markFailed(importJobId, executorId, failure)
            );
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
        DatasetUploadSession session = sessionRepo.findByImportJobId(importJobId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "upload session not found for import job: " + importJobId
                ));
        if (!version.getId().equals(session.getVersionId())) {
            throw new IllegalArgumentException("upload session version does not match import job");
        }
        String taskType = DatasetTaskType.normalize(session.getType());
        String sampleGrouping = session.getSampleGrouping();
        boolean multimodal = "MULTIMODAL".equals(taskType);
        if (multimodal
                && !GROUPING_MANIFEST.equals(sampleGrouping)
                && !GROUPING_AUTO_DIRECTORY.equals(sampleGrouping)) {
            throw new IllegalArgumentException(
                    "upload session sampleGrouping must be MANIFEST or AUTO_DIRECTORY"
            );
        }
        if (!multimodal && sampleGrouping != null) {
            throw new IllegalArgumentException(
                    "single-modal import cannot use sampleGrouping"
            );
        }

        String objectName;
        String manifestPath = session.getManifestPath();
        String packageManifestPath = null;
        String packageId = job.getPackageId();
        String packageRole = null;
        if (packageId == null || packageId.isBlank()) {
            objectName = version.getStoragePath();
            if (objectName == null || objectName.isBlank()) {
                throw new IllegalArgumentException(
                        "dataset version storagePath is blank: " + version.getId()
                );
            }
            packageId = null;
        } else {
            DatasetPackage datasetPackage = packageRepo.findByIdAndDeletedFalse(packageId)
                    .orElseThrow(() -> new IllegalArgumentException(
                            "dataset package not found: " + job.getPackageId()
                    ));
            if (!version.getAssetId().equals(datasetPackage.getDatasetAssetId())) {
                throw new IllegalArgumentException("dataset package does not belong to version asset");
            }
            DatasetVersionPackage relation = versionPackageRepo
                    .findByDatasetVersionIdAndPackageId(
                            version.getId(),
                            datasetPackage.getId()
                    )
                    .orElseThrow(() -> new IllegalArgumentException(
                            "dataset package is not linked to version"
                    ));
            packageRole = relation.getPackageRole();
            objectName = datasetPackage.getStoragePath();
            if (objectName == null || objectName.isBlank()) {
                throw new IllegalArgumentException(
                        "dataset package storagePath is blank: " + datasetPackage.getId()
                );
            }
            if (GROUPING_MANIFEST.equals(sampleGrouping)
                    && datasetPackage.getManifestPath() != null
                    && !datasetPackage.getManifestPath().isBlank()) {
                manifestPath = datasetPackage.getManifestPath();
            }
            packageManifestPath = datasetPackage.getManifestPath();
        }

        if (multimodal && GROUPING_MANIFEST.equals(sampleGrouping)) {
            manifestPath = DatasetUploadService.normalizeManifestPath(
                    GROUPING_MANIFEST,
                    manifestPath
            );
        } else if (multimodal) {
            if ((manifestPath != null && !manifestPath.isBlank())
                    || (packageManifestPath != null && !packageManifestPath.isBlank())) {
                throw new IllegalArgumentException(
                        "AUTO_DIRECTORY import cannot use manifestPath"
                );
            }
            manifestPath = null;
        } else {
            if ((manifestPath != null && !manifestPath.isBlank())
                    || (packageManifestPath != null && !packageManifestPath.isBlank())) {
                throw new IllegalArgumentException(
                        "single-modal import cannot use manifestPath"
                );
            }
            manifestPath = null;
        }

        return new ImportContext(
                importJobId,
                version.getId(),
                version.getAssetId(),
                taskType,
                packageId,
                packageRole,
                objectName,
                sampleGrouping,
                manifestPath
        );
    }

    private ManifestImportPlan buildPlan(
            ImportContext context,
            List<ZipEntryInfo> entries,
            long objectSize
    ) throws Exception {
        int generatedStart = generatedSampleIndexStart(context);
        if (!"MULTIMODAL".equals(context.taskType())) {
            return singleModalImportPlanBuilder.build(
                    context.taskType(),
                    entries,
                    generatedStart
            );
        }
        if (GROUPING_AUTO_DIRECTORY.equals(context.sampleGrouping())) {
            return autoDirectoryManifestBuilder.build(entries, generatedStart);
        }
        String manifestJson = manifestReader.readManifest(
                context.objectName(),
                objectSize,
                context.manifestPath()
        );
        return manifestParser.parse(
                manifestJson,
                entries,
                context.manifestPath(),
                generatedStart
        );
    }

    private int generatedSampleIndexStart(ImportContext context) {
        if (!context.appendPackage()) {
            return 0;
        }
        Integer maxSampleIndex =
                sampleRepo.findMaxSampleIndexByDatasetVersionIdAndDeletedFalse(
                        context.versionId()
                );
        return (maxSampleIndex == null ? -1 : maxSampleIndex) + 1;
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

        if (context.appendPackage()) {
            validateAppendConflicts(context.versionId(), plan);
        }

        Instant now = Instant.now();
        List<DatasetSample> samples = new ArrayList<>(plan.totalSamples());
        List<DatasetSampleData> dataItems = new ArrayList<>(plan.totalDataCount());
        List<DatasetAnnotation> annotations = new ArrayList<>(plan.totalAnnotationCount());

        for (ManifestSample manifestSample : plan.samples()) {
            DatasetSample sample = toSample(version, context.packageId(), manifestSample, now);
            samples.add(sample);

            Map<String, DatasetSampleData> dataByPath = new LinkedHashMap<>();
            for (ManifestData manifestData : manifestSample.data()) {
                DatasetSampleData data = toSampleData(
                        version,
                        sample,
                        context.packageId(),
                        manifestData,
                        now
                );
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
                        context.packageId(),
                        manifestAnnotation,
                        now
                ));
            }
        }

        sampleRepo.saveAllAndFlush(samples);
        dataRepo.saveAllAndFlush(dataItems);
        annotationRepo.saveAllAndFlush(annotations);
        version.setFileCount(countPersistedFiles(version.getId()));

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

        if (context.appendPackage()) {
            DatasetPackage datasetPackage = packageRepo
                    .findByIdAndDeletedFalse(context.packageId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "dataset package not found: " + context.packageId()
            ));
            datasetPackage.setStatus(VERSION_READY);
            packageRepo.saveAndFlush(datasetPackage);
            versionRepo.saveAndFlush(version);
        } else {
            version.setStatus(VERSION_READY);
            version.setPublishedAt(now);
            versionRepo.saveAndFlush(version);

            if (shouldUpdateCurrentVersion(asset, version)) {
                asset.setCurrentVersionId(version.getId());
                asset.setUpdatedAt(now);
                assetRepo.saveAndFlush(asset);
            }
        }
    }

    private long countPersistedFiles(String versionId) {
        return dataRepo.countByDatasetVersionId(versionId)
                + annotationRepo.countByDatasetVersionId(versionId);
    }

    private void validateAppendConflicts(
            String versionId,
            ManifestImportPlan plan
    ) {
        Collection<String> externalIds = plan.samples().stream()
                .map(ManifestSample::externalId)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        List<DatasetSample> externalConflicts =
                sampleRepo.findByDatasetVersionIdAndDeletedFalseAndExternalIdIn(
                        versionId,
                        externalIds
                );
        if (!externalConflicts.isEmpty()) {
            throw new IllegalArgumentException(
                    "external_id already exists in DRAFT: "
                            + externalConflicts.get(0).getExternalId()
            );
        }

        Collection<Integer> sampleIndexes = plan.samples().stream()
                .map(ManifestSample::sampleIndex)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
        List<DatasetSample> indexConflicts =
                sampleRepo.findByDatasetVersionIdAndDeletedFalseAndSampleIndexIn(
                        versionId,
                        sampleIndexes
                );
        if (!indexConflicts.isEmpty()) {
            throw new IllegalArgumentException(
                    "sample_index already exists in DRAFT: "
                            + indexConflicts.get(0).getSampleIndex()
            );
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

    private void markFailed(
            String importJobId,
            String executorId,
            ImportFailure failure
    ) {
        Instant now = Instant.now();
        int failed = jobRepo.markFailedIfOwned(
                importJobId,
                executorId,
                JOB_RUNNING,
                truncateError(failure.message()),
                failure.code(),
                failure.detailsJson(),
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
        jobRepo.findById(importJobId)
                .filter(job -> job.getPackageId() != null)
                .flatMap(job -> versionPackageRepo.findByDatasetVersionIdAndPackageId(
                        job.getDatasetVersionId(),
                        job.getPackageId()
                ).map(relation -> Map.entry(job, relation)))
                .filter(entry -> PACKAGE_ROLE_APPEND.equals(entry.getValue().getPackageRole()))
                .flatMap(entry -> packageRepo.findByIdAndDeletedFalse(
                        entry.getKey().getPackageId()
                ))
                .ifPresent(datasetPackage -> {
                    datasetPackage.setStatus(JOB_FAILED);
                    packageRepo.saveAndFlush(datasetPackage);
                });
    }

    private static DatasetSample toSample(
            DatasetVersion version,
            String packageId,
            ManifestSample source,
            Instant now
    ) {
        DatasetSample target = new DatasetSample();
        target.setId(id("sample"));
        target.setDatasetVersionId(version.getId());
        target.setCreatedByPackageId(packageId);
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
            String packageId,
            ManifestData source,
            Instant now
    ) {
        ZipEntryInfo entry = source.zipEntryInfo();
        DatasetSampleData target = new DatasetSampleData();
        target.setId(id("data"));
        target.setSampleId(sample.getId());
        target.setDatasetVersionId(version.getId());
        target.setPackageId(packageId);
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
            String packageId,
            ManifestAnnotation source,
            Instant now
    ) {
        ZipEntryInfo entry = source.zipEntryInfo();
        DatasetAnnotation target = new DatasetAnnotation();
        target.setId(id("annotation"));
        target.setSampleId(sample.getId());
        target.setSampleDataId(referencedData == null ? null : referencedData.getId());
        target.setDatasetVersionId(version.getId());
        target.setPackageId(packageId);
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

    private static ImportFailure importFailure(Exception exception) {
        ManifestValidationException validation = findCause(
                exception,
                ManifestValidationException.class
        );
        if (validation != null) {
            if (!"INVALID_MANIFEST".equals(validation.getErrorCode())) {
                return new ImportFailure(
                        validation.getErrorCode(),
                        validation.getMessage(),
                        toJson(validation.getDetails())
                );
            }
            String code = classifyManifestFailure(validation.getMessage());
            return new ImportFailure(
                    code,
                    manifestUserMessage(code),
                    toJson(validation.getDetails())
            );
        }

        String message = rootMessage(exception);
        if (message.contains("external_id already exists")
                || message.contains("sample_index already exists")) {
            return new ImportFailure(
                    "DUPLICATE_SAMPLE",
                    "上传内容包含已存在的样本",
                    null
            );
        }
        return new ImportFailure(
                "IMPORT_FAILED",
                "数据导入失败，请检查上传内容后重试",
                null
        );
    }

    private static String classifyManifestFailure(String message) {
        String normalized = message == null
                ? ""
                : message.toLowerCase(java.util.Locale.ROOT);
        if (normalized.contains("duplicate external_id")
                || normalized.contains("duplicate sample_index")) {
            return "DUPLICATE_SAMPLE";
        }
        if (normalized.contains("ambiguous")
                && normalized.contains("annotation")) {
            return "ANNOTATION_TARGET_AMBIGUOUS";
        }
        if (normalized.contains("annotation")
                && normalized.contains("not found")) {
            return "ANNOTATION_TARGET_NOT_FOUND";
        }
        if (normalized.contains("unsupported")) {
            return "UNSUPPORTED_SAMPLE_FILE";
        }
        if (normalized.contains("sample directory")
                || normalized.contains("root-level")
                || normalized.contains("auto_directory")) {
            return "INVALID_SAMPLE_DIRECTORY";
        }
        return "INVALID_MANIFEST";
    }

    private static String manifestUserMessage(String code) {
        return switch (code) {
            case "DUPLICATE_SAMPLE" -> "上传内容包含重复样本";
            case "ANNOTATION_TARGET_NOT_FOUND" -> "标注文件找不到对应的数据文件";
            case "ANNOTATION_TARGET_AMBIGUOUS" -> "标注文件对应多个数据文件";
            case "UNSUPPORTED_SAMPLE_FILE" -> "上传内容包含不支持的样本文件";
            case "INVALID_SAMPLE_DIRECTORY" -> "样本目录结构不符合要求";
            default -> "Manifest 内容无效，请检查后重试";
        };
    }

    private static String toJson(Map<String, Object> details) {
        if (details == null || details.isEmpty()) {
            return null;
        }
        try {
            return ERROR_DETAILS_MAPPER.writeValueAsString(details);
        } catch (JsonProcessingException exception) {
            return null;
        }
    }

    private static <T extends Throwable> T findCause(
            Throwable throwable,
            Class<T> type
    ) {
        Throwable current = throwable;
        while (current != null) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            current = current.getCause();
        }
        return null;
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
            String taskType,
            String packageId,
            String packageRole,
            String objectName,
            String sampleGrouping,
            String manifestPath
    ) {
        private boolean appendPackage() {
            return PACKAGE_ROLE_APPEND.equals(packageRole);
        }
    }

    private record ImportFailure(
            String code,
            String message,
            String detailsJson
    ) {
    }
}
