package com.tss.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.entity.DatasetAnnotation;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetSampleData;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.repository.DatasetAnnotationRepository;
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

    private final DatasetVersionPackageRepository versionPackageRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetSampleDataRepository dataRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final EntityManager entityManager;
    private final ObjectMapper objectMapper;

    public DatasetWorkspaceMaterializer(
            DatasetVersionPackageRepository versionPackageRepo,
            DatasetSampleRepository sampleRepo,
            DatasetSampleDataRepository dataRepo,
            DatasetAnnotationRepository annotationRepo,
            EntityManager entityManager,
            ObjectMapper objectMapper
    ) {
        this.versionPackageRepo = versionPackageRepo;
        this.sampleRepo = sampleRepo;
        this.dataRepo = dataRepo;
        this.annotationRepo = annotationRepo;
        this.entityManager = entityManager;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void materialize(DatasetVersion parent, DatasetVersion draft) {
        Instant now = Instant.now();
        copyPackageRelations(parent, draft.getId(), now);

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

    private void copyPackageRelations(
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
            return;
        }

        List<DatasetVersionPackage> copiedRelations = parentRelations.stream()
                .map(source -> copyPackageRelation(source, draftVersionId, now))
                .toList();
        versionPackageRepo.saveAll(copiedRelations);
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
