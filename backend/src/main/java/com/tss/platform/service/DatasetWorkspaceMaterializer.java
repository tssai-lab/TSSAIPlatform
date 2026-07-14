package com.tss.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.entity.DatasetAnnotation;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetPackage;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetSampleData;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.model.DatasetTaskType;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.model.manifest.ManifestData;
import com.tss.platform.model.manifest.ManifestImportPlan;
import com.tss.platform.model.manifest.ManifestSample;
import com.tss.platform.repository.DatasetAnnotationRepository;
import com.tss.platform.repository.DatasetPackageRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionPackageRepository;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class DatasetWorkspaceMaterializer {

    static final int BATCH_SIZE = 500;

    private static final TypeReference<Map<String, Object>> JSON_MAP_TYPE =
            new TypeReference<>() {
            };
    private static final String READY = "READY";
    private static final String PRIMARY = "PRIMARY";

    private final DatasetPackageRepository packageRepo;
    private final DatasetVersionPackageRepository versionPackageRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetSampleDataRepository dataRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final ZipCentralDirectoryReader zipReader;
    private final SingleModalImportPlanBuilder singleModalImportPlanBuilder;
    private final EntityManager entityManager;
    private final ObjectMapper objectMapper;

    public DatasetWorkspaceMaterializer(
            DatasetPackageRepository packageRepo,
            DatasetVersionPackageRepository versionPackageRepo,
            DatasetSampleRepository sampleRepo,
            DatasetSampleDataRepository dataRepo,
            DatasetAnnotationRepository annotationRepo,
            ZipCentralDirectoryReader zipReader,
            SingleModalImportPlanBuilder singleModalImportPlanBuilder,
            EntityManager entityManager,
            ObjectMapper objectMapper
    ) {
        this.packageRepo = packageRepo;
        this.versionPackageRepo = versionPackageRepo;
        this.sampleRepo = sampleRepo;
        this.dataRepo = dataRepo;
        this.annotationRepo = annotationRepo;
        this.zipReader = zipReader;
        this.singleModalImportPlanBuilder = singleModalImportPlanBuilder;
        this.entityManager = entityManager;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void materialize(
            DatasetAsset asset,
            DatasetVersion parent,
            DatasetVersion draft
    ) {
        Instant now = Instant.now();
        String generatedPrimaryPackageId = copyPackageRelations(
                asset,
                parent,
                draft.getId(),
                now
        );
        if (generatedPrimaryPackageId != null) {
            materializeSingleModalZip(
                    asset,
                    parent,
                    draft,
                    generatedPrimaryPackageId,
                    now
            );
            return;
        }

        Pageable pageable = PageRequest.of(0, BATCH_SIZE);
        while (true) {
            Slice<DatasetSample> parentSamples =
                    sampleRepo.findByDatasetVersionIdAndDeletedFalseOrderBySampleIndexAscIdAsc(
                            parent.getId(),
                            pageable
                    );
            if (parentSamples.isEmpty()) {
                return;
            }

            copySampleBatch(parent, draft, parentSamples.getContent(), now);
            entityManager.flush();
            entityManager.clear();

            if (!parentSamples.hasNext()) {
                return;
            }
            pageable = parentSamples.nextPageable();
        }
    }

    private String copyPackageRelations(
            DatasetAsset asset,
            DatasetVersion parent,
            String draftVersionId,
            Instant now
    ) {
        List<DatasetVersionPackage> parentRelations =
                versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(parent.getId());
        if (parentRelations.isEmpty()) {
            if (parent.getStoragePath() == null || parent.getStoragePath().isBlank()) {
                throw new IllegalArgumentException(
                        "READY dataset version has no package relation or storagePath: "
                                + parent.getId()
                );
            }
            if (isZipBackedSingleModal(asset, parent)) {
                DatasetPackage primaryPackage = createPrimaryPackage(
                        asset,
                        parent,
                        now
                );
                DatasetVersionPackage relation = new DatasetVersionPackage();
                relation.setDatasetVersionId(draftVersionId);
                relation.setPackageId(primaryPackage.getId());
                relation.setPackageRole(PRIMARY);
                relation.setPackageOrder(0);
                relation.setCreatedAt(now);
                versionPackageRepo.saveAll(List.of(relation));
                return primaryPackage.getId();
            }
            if (isSingleModal(asset)) {
                throw new IllegalArgumentException(
                        "single-modal workspace requires ZIP-backed READY version: "
                                + parent.getId()
                );
            }
            return null;
        }

        List<DatasetVersionPackage> copiedRelations = parentRelations.stream()
                .map(source -> copyPackageRelation(source, draftVersionId, now))
                .toList();
        versionPackageRepo.saveAll(copiedRelations);
        return null;
    }

    private DatasetPackage createPrimaryPackage(
            DatasetAsset asset,
            DatasetVersion parent,
            Instant now
    ) {
        DatasetPackage datasetPackage = new DatasetPackage();
        datasetPackage.setId(id("dataset-pkg"));
        datasetPackage.setDatasetAssetId(asset.getId());
        datasetPackage.setStoragePath(parent.getStoragePath());
        datasetPackage.setFileName(sourceName(parent));
        datasetPackage.setSizeBytes(parent.getSizeBytes());
        datasetPackage.setStatus(READY);
        datasetPackage.setCreatedAt(now);
        datasetPackage.setDeleted(false);
        return packageRepo.saveAndFlush(datasetPackage);
    }

    private boolean isZipBackedSingleModal(DatasetAsset asset, DatasetVersion parent) {
        if (asset == null
                || asset.getType() == null
                || asset.getType().isBlank()
                || parent.getSizeBytes() == null) {
            return false;
        }
        String taskType = DatasetTaskType.normalize(asset.getType());
        return !"MULTIMODAL".equals(taskType) && isZip(sourceName(parent));
    }

    private boolean isSingleModal(DatasetAsset asset) {
        return asset != null
                && asset.getType() != null
                && !asset.getType().isBlank()
                && !"MULTIMODAL".equals(DatasetTaskType.normalize(asset.getType()));
    }

    private String sourceName(DatasetVersion version) {
        return version.getFileName() == null || version.getFileName().isBlank()
                ? version.getStoragePath()
                : version.getFileName();
    }

    private boolean isZip(String path) {
        return path != null && path.toLowerCase().endsWith(".zip");
    }

    private void materializeSingleModalZip(
            DatasetAsset asset,
            DatasetVersion parent,
            DatasetVersion draft,
            String packageId,
            Instant now
    ) {
        List<ZipEntryInfo> entries;
        try {
            entries = zipReader.read(parent.getStoragePath(), parent.getSizeBytes());
        } catch (Exception exception) {
            throw new IllegalArgumentException(
                    "READY single-modal ZIP could not be indexed: "
                            + exception.getMessage(),
                    exception
            );
        }
        ManifestImportPlan plan = singleModalImportPlanBuilder.build(
                DatasetTaskType.normalize(asset.getType()),
                entries,
                0
        );
        List<DatasetSample> samples = new ArrayList<>(plan.totalSamples());
        List<DatasetSampleData> dataItems = new ArrayList<>(plan.totalDataCount());
        for (ManifestSample manifestSample : plan.samples()) {
            DatasetSample sample = toSample(draft, packageId, manifestSample, now);
            samples.add(sample);
            for (ManifestData manifestData : manifestSample.data()) {
                dataItems.add(toSampleData(
                        draft,
                        sample,
                        packageId,
                        manifestData,
                        now
                ));
            }
        }
        sampleRepo.saveAll(samples);
        if (!dataItems.isEmpty()) {
            dataRepo.saveAll(dataItems);
        }
        entityManager.flush();
        entityManager.clear();
    }

    private void copySampleBatch(
            DatasetVersion parent,
            DatasetVersion draft,
            List<DatasetSample> parentSamples,
            Instant now
    ) {
        Map<String, DatasetSample> copiedSampleByParentId = new LinkedHashMap<>();
        List<DatasetSample> copiedSamples = new ArrayList<>(parentSamples.size());
        for (DatasetSample source : parentSamples) {
            DatasetSample copied = copySample(source, draft, now);
            copiedSamples.add(copied);
            copiedSampleByParentId.put(source.getId(), copied);
        }

        List<String> parentSampleIds = new ArrayList<>(copiedSampleByParentId.keySet());
        List<DatasetSampleData> parentData =
                dataRepo.findByDatasetVersionIdAndSampleIdInOrderBySampleIdAscSeqAscIdAsc(
                        parent.getId(),
                        parentSampleIds
                );
        Map<String, DatasetSampleData> copiedDataByParentId = new LinkedHashMap<>();
        List<DatasetSampleData> copiedData = new ArrayList<>(parentData.size());
        for (DatasetSampleData source : parentData) {
            DatasetSample copiedSample = requireCopiedSample(
                    copiedSampleByParentId,
                    source.getSampleId()
            );
            DatasetSampleData copied = copyData(source, copiedSample, draft, now);
            copiedData.add(copied);
            copiedDataByParentId.put(source.getId(), copied);
        }

        List<DatasetAnnotation> parentAnnotations =
                annotationRepo
                        .findByDatasetVersionIdAndSampleIdInOrderBySampleIdAscCreatedAtAscIdAsc(
                                parent.getId(),
                                parentSampleIds
                        );
        List<DatasetAnnotation> copiedAnnotations =
                new ArrayList<>(parentAnnotations.size());
        for (DatasetAnnotation source : parentAnnotations) {
            DatasetSample copiedSample = requireCopiedSample(
                    copiedSampleByParentId,
                    source.getSampleId()
            );
            DatasetSampleData copiedReferencedData = null;
            if (source.getSampleDataId() != null) {
                copiedReferencedData = copiedDataByParentId.get(source.getSampleDataId());
                if (copiedReferencedData == null) {
                    throw new IllegalStateException(
                            "annotation references sample data outside copied parent batch: "
                                    + source.getSampleDataId()
                    );
                }
            }
            copiedAnnotations.add(
                    copyAnnotation(source, copiedSample, copiedReferencedData, draft, now)
            );
        }

        sampleRepo.saveAll(copiedSamples);
        if (!copiedData.isEmpty()) {
            dataRepo.saveAll(copiedData);
        }
        if (!copiedAnnotations.isEmpty()) {
            annotationRepo.saveAll(copiedAnnotations);
        }
    }

    private DatasetSample requireCopiedSample(
            Map<String, DatasetSample> copiedSampleByParentId,
            String parentSampleId
    ) {
        DatasetSample copied = copiedSampleByParentId.get(parentSampleId);
        if (copied == null) {
            throw new IllegalStateException(
                    "sample child references sample outside copied parent batch: "
                            + parentSampleId
            );
        }
        return copied;
    }

    private DatasetSample toSample(
            DatasetVersion draft,
            String packageId,
            ManifestSample source,
            Instant now
    ) {
        DatasetSample target = new DatasetSample();
        target.setId(id("sample"));
        target.setDatasetVersionId(draft.getId());
        target.setCreatedByPackageId(packageId);
        target.setExternalId(source.externalId());
        target.setSampleIndex(source.sampleIndex());
        target.setTags(source.tags());
        target.setMetadata(source.metadata());
        target.setOwnerUserId(draft.getOwnerUserId());
        target.setCreatedAt(now);
        target.setUpdatedAt(now);
        target.setDeleted(false);
        target.setDeletedAt(null);
        return target;
    }

    private DatasetVersionPackage copyPackageRelation(
            DatasetVersionPackage source,
            String draftVersionId,
            Instant now
    ) {
        DatasetVersionPackage target = new DatasetVersionPackage();
        target.setDatasetVersionId(draftVersionId);
        target.setPackageId(source.getPackageId());
        target.setPackageRole(source.getPackageRole());
        target.setPackageOrder(source.getPackageOrder());
        target.setCreatedAt(now);
        return target;
    }

    private DatasetSample copySample(
            DatasetSample source,
            DatasetVersion draft,
            Instant now
    ) {
        DatasetSample target = new DatasetSample();
        target.setId(id("sample"));
        target.setDatasetVersionId(draft.getId());
        target.setCreatedByPackageId(source.getCreatedByPackageId());
        target.setExternalId(source.getExternalId());
        target.setSampleIndex(source.getSampleIndex());
        target.setTags(copyJson(source.getTags()));
        target.setMetadata(copyJson(source.getMetadata()));
        target.setOwnerUserId(source.getOwnerUserId());
        target.setCreatedAt(now);
        target.setUpdatedAt(now);
        target.setDeleted(false);
        target.setDeletedAt(null);
        return target;
    }

    private DatasetSampleData copyData(
            DatasetSampleData source,
            DatasetSample copiedSample,
            DatasetVersion draft,
            Instant now
    ) {
        DatasetSampleData target = new DatasetSampleData();
        target.setId(id("data"));
        target.setSampleId(copiedSample.getId());
        target.setDatasetVersionId(draft.getId());
        target.setPackageId(source.getPackageId());
        target.setDataType(source.getDataType());
        target.setSensor(source.getSensor());
        target.setChannel(source.getChannel());
        target.setSeq(source.getSeq());
        target.setFormat(source.getFormat());
        target.setOriginalPath(source.getOriginalPath());
        target.setFileName(source.getFileName());
        target.setSizeBytes(source.getSizeBytes());
        target.setChecksum(source.getChecksum());
        target.setContentType(source.getContentType());
        target.setZipEntryOffset(source.getZipEntryOffset());
        target.setZipDataOffset(source.getZipDataOffset());
        target.setCompressedSize(source.getCompressedSize());
        target.setUncompressedSize(source.getUncompressedSize());
        target.setCompressionMethod(source.getCompressionMethod());
        target.setCrc32(source.getCrc32());
        target.setMetadata(copyJson(source.getMetadata()));
        target.setCreatedAt(now);
        target.setUpdatedAt(now);
        return target;
    }

    private DatasetSampleData toSampleData(
            DatasetVersion draft,
            DatasetSample sample,
            String packageId,
            ManifestData source,
            Instant now
    ) {
        ZipEntryInfo entry = source.zipEntryInfo();
        DatasetSampleData target = new DatasetSampleData();
        target.setId(id("data"));
        target.setSampleId(sample.getId());
        target.setDatasetVersionId(draft.getId());
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
        target.setZipEntryOffset(entry.localHeaderOffset());
        target.setZipDataOffset(entry.zipDataOffset());
        target.setCompressedSize(entry.compressedSize());
        target.setUncompressedSize(entry.uncompressedSize());
        target.setCompressionMethod(compressionMethod(entry.method()));
        target.setCrc32(entry.crc32());
        target.setMetadata(source.metadata());
        target.setCreatedAt(now);
        target.setUpdatedAt(now);
        return target;
    }

    private static String compressionMethod(int method) {
        return switch (method) {
            case 0 -> "STORED";
            case 8 -> "DEFLATED";
            default -> throw new IllegalArgumentException(
                    "unsupported ZIP compression method: " + method
            );
        };
    }

    private DatasetAnnotation copyAnnotation(
            DatasetAnnotation source,
            DatasetSample copiedSample,
            DatasetSampleData copiedReferencedData,
            DatasetVersion draft,
            Instant now
    ) {
        DatasetAnnotation target = new DatasetAnnotation();
        target.setId(id("annotation"));
        target.setSampleId(copiedSample.getId());
        target.setSampleDataId(
                copiedReferencedData == null ? null : copiedReferencedData.getId()
        );
        target.setDatasetVersionId(draft.getId());
        target.setPackageId(source.getPackageId());
        target.setAnnotationType(source.getAnnotationType());
        target.setFormat(source.getFormat());
        target.setOriginalPath(source.getOriginalPath());
        target.setFileName(source.getFileName());
        target.setSizeBytes(source.getSizeBytes());
        target.setChecksum(source.getChecksum());
        target.setContentType(source.getContentType());
        target.setZipEntryOffset(source.getZipEntryOffset());
        target.setZipDataOffset(source.getZipDataOffset());
        target.setCompressedSize(source.getCompressedSize());
        target.setUncompressedSize(source.getUncompressedSize());
        target.setCompressionMethod(source.getCompressionMethod());
        target.setCrc32(source.getCrc32());
        target.setMetadata(copyJson(source.getMetadata()));
        target.setCreatedAt(now);
        return target;
    }

    private Map<String, Object> copyJson(Map<String, Object> source) {
        return source == null ? null : objectMapper.convertValue(source, JSON_MAP_TYPE);
    }

    private static String id(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "");
    }
}
