package com.tss.platform.service;

import com.tss.platform.dto.DatasetWorkspacePublishDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetPackage;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAnnotationRepository;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetPackageRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionPackageRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DatasetWorkspacePublishService {

    private static final String DRAFT = "DRAFT";
    private static final String READY = "READY";
    private static final String SUCCESS = "SUCCESS";
    private static final String PRIMARY = "PRIMARY";
    private static final String APPEND = "APPEND";
    private static final String NOT_FOUND =
            "dataset workspace version not found or no permission";

    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final ImportJobRepository importJobRepo;
    private final DatasetVersionPackageRepository versionPackageRepo;
    private final DatasetPackageRepository packageRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetSampleDataRepository dataRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final AuthContext authContext;

    public DatasetWorkspacePublishService(
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            ImportJobRepository importJobRepo,
            DatasetVersionPackageRepository versionPackageRepo,
            DatasetPackageRepository packageRepo,
            DatasetSampleRepository sampleRepo,
            DatasetSampleDataRepository dataRepo,
            DatasetAnnotationRepository annotationRepo,
            AuthContext authContext
    ) {
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.importJobRepo = importJobRepo;
        this.versionPackageRepo = versionPackageRepo;
        this.packageRepo = packageRepo;
        this.sampleRepo = sampleRepo;
        this.dataRepo = dataRepo;
        this.annotationRepo = annotationRepo;
        this.authContext = authContext;
    }

    @Transactional
    public DatasetWorkspacePublishDto publish(String draftVersionId) {
        if (draftVersionId == null || draftVersionId.isBlank()) {
            throw new IllegalArgumentException(NOT_FOUND);
        }

        DatasetVersion snapshot = versionRepo.findByIdAndDeletedFalse(draftVersionId)
                .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));
        DatasetAsset asset = assetRepo
                .findByIdAndDeletedFalseForUpdate(snapshot.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));
        DatasetVersion draft = versionRepo
                .findByIdAndDeletedFalseForUpdate(draftVersionId)
                .orElseThrow(() -> new IllegalArgumentException(NOT_FOUND));

        if (!asset.getId().equals(draft.getAssetId())
                || !authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new IllegalArgumentException(NOT_FOUND);
        }
        if (!DRAFT.equals(draft.getStatus())) {
            throw new IllegalArgumentException("dataset version must be DRAFT");
        }

        validateLineage(asset, draft);
        List<ImportJob> importJobs = validateImportJobs(draft.getId());
        Set<String> linkedPackageIds = validatePackages(asset, draft);
        validateImportJobPackages(importJobs, linkedPackageIds);
        validateSamples(draft.getId());
        validateMetadataPackageReferences(draft.getId(), linkedPackageIds);

        Instant now = Instant.now();
        draft.setStatus(READY);
        draft.setPublishedAt(now);
        versionRepo.saveAndFlush(draft);

        asset.setCurrentVersionId(draft.getId());
        asset.setUpdatedAt(now);
        assetRepo.saveAndFlush(asset);

        DatasetWorkspacePublishDto dto = new DatasetWorkspacePublishDto();
        dto.setDatasetVersionId(draft.getId());
        dto.setDatasetAssetId(asset.getId());
        dto.setParentVersionId(draft.getParentVersionId());
        dto.setVersionNo(draft.getVersionNo());
        dto.setStatus(draft.getStatus());
        dto.setPublishedAt(draft.getPublishedAt());
        dto.setCurrentVersionId(asset.getCurrentVersionId());
        dto.setMessage("dataset workspace published");
        return dto;
    }

    private void validateLineage(DatasetAsset asset, DatasetVersion draft) {
        if (draft.getParentVersionId() == null || draft.getParentVersionId().isBlank()) {
            throw new IllegalArgumentException("dataset workspace parent READY version is missing");
        }
        DatasetVersion parent = versionRepo
                .findByIdAndDeletedFalse(draft.getParentVersionId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset workspace parent READY version is missing"
                ));
        if (!asset.getId().equals(parent.getAssetId()) || !READY.equals(parent.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset workspace parent version must be READY"
            );
        }

        String currentVersionId = asset.getCurrentVersionId();
        if (currentVersionId == null || currentVersionId.isBlank()) {
            throw new IllegalArgumentException("dataset asset current READY version is missing");
        }
        DatasetVersion current = versionRepo.findByIdAndDeletedFalse(currentVersionId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "dataset asset current READY version is missing"
                ));
        if (!asset.getId().equals(current.getAssetId()) || !READY.equals(current.getStatus())) {
            throw new IllegalArgumentException(
                    "dataset asset current version must be READY"
            );
        }
        if (draft.getVersionNo() == null
                || current.getVersionNo() == null
                || draft.getVersionNo() <= current.getVersionNo()) {
            throw new IllegalArgumentException(
                    "draft version must be newer than current READY version"
            );
        }
    }

    private List<ImportJob> validateImportJobs(String draftVersionId) {
        List<ImportJob> importJobs =
                importJobRepo.findByDatasetVersionId(draftVersionId);
        for (ImportJob job : importJobs) {
            if (!SUCCESS.equals(job.getStatus())) {
                throw new IllegalArgumentException(
                        "dataset workspace has non-success ImportJob: " + job.getStatus()
                );
            }
        }
        return importJobs;
    }

    private void validateImportJobPackages(
            List<ImportJob> importJobs,
            Set<String> linkedPackageIds
    ) {
        for (ImportJob job : importJobs) {
            if (job.getPackageId() == null
                    || job.getPackageId().isBlank()
                    || !linkedPackageIds.contains(job.getPackageId())) {
                throw new IllegalArgumentException(
                        "dataset workspace ImportJob references unlinked package: "
                                + job.getPackageId()
                );
            }
        }
    }

    private Set<String> validatePackages(DatasetAsset asset, DatasetVersion draft) {
        List<DatasetVersionPackage> relations =
                versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(
                        draft.getId()
                );
        if (relations.isEmpty()) {
            throw new IllegalArgumentException("dataset workspace has no package relation");
        }

        Set<String> packageIds = new LinkedHashSet<>();
        int primaryCount = 0;
        for (int index = 0; index < relations.size(); index++) {
            DatasetVersionPackage relation = relations.get(index);
            if (!draft.getId().equals(relation.getDatasetVersionId())
                    || relation.getPackageOrder() == null
                    || relation.getPackageOrder() != index) {
                throw new IllegalArgumentException(
                        "dataset workspace package order is incomplete"
                );
            }
            if (PRIMARY.equals(relation.getPackageRole())) {
                primaryCount += 1;
                if (index != 0) {
                    throw new IllegalArgumentException(
                            "dataset workspace PRIMARY package must be first"
                    );
                }
            } else if (!APPEND.equals(relation.getPackageRole())) {
                throw new IllegalArgumentException(
                        "dataset workspace package role is invalid: "
                                + relation.getPackageRole()
                );
            }
            if (relation.getPackageId() == null
                    || relation.getPackageId().isBlank()
                    || !packageIds.add(relation.getPackageId())) {
                throw new IllegalArgumentException(
                        "dataset workspace package relation is invalid"
                );
            }
        }
        if (primaryCount != 1) {
            throw new IllegalArgumentException(
                    "dataset workspace must have exactly one PRIMARY package"
            );
        }

        Map<String, DatasetPackage> packagesById = new HashMap<>();
        for (DatasetPackage datasetPackage :
                packageRepo.findAllById(List.copyOf(packageIds))) {
            packagesById.put(datasetPackage.getId(), datasetPackage);
        }
        for (String packageId : packageIds) {
            DatasetPackage datasetPackage = packagesById.get(packageId);
            if (datasetPackage == null
                    || Boolean.TRUE.equals(datasetPackage.getDeleted())
                    || !asset.getId().equals(datasetPackage.getDatasetAssetId())) {
                throw new IllegalArgumentException(
                        "dataset workspace package is missing: " + packageId
                );
            }
            if (!READY.equals(datasetPackage.getStatus())) {
                throw new IllegalArgumentException(
                        "dataset workspace package is not READY: "
                                + packageId + ", status=" + datasetPackage.getStatus()
                );
            }
            if (datasetPackage.getStoragePath() == null
                    || datasetPackage.getStoragePath().isBlank()) {
                throw new IllegalArgumentException(
                        "dataset workspace package storage is missing: " + packageId
                );
            }
        }
        return packageIds;
    }

    private void validateSamples(String draftVersionId) {
        if (sampleRepo.countByDatasetVersionIdAndDeletedFalse(draftVersionId) == 0) {
            throw new IllegalArgumentException(
                    "dataset workspace must contain at least one undeleted sample"
            );
        }
        List<String> duplicateExternalIds =
                sampleRepo.findDuplicateExternalIdsByDatasetVersionId(draftVersionId);
        if (!duplicateExternalIds.isEmpty()) {
            throw new IllegalArgumentException(
                    "duplicate externalId in dataset workspace: "
                            + duplicateExternalIds.get(0)
            );
        }
        List<Integer> duplicateSampleIndexes =
                sampleRepo.findDuplicateSampleIndexesByDatasetVersionId(draftVersionId);
        if (!duplicateSampleIndexes.isEmpty()) {
            throw new IllegalArgumentException(
                    "duplicate sampleIndex in dataset workspace: "
                            + duplicateSampleIndexes.get(0)
            );
        }
    }

    private void validateMetadataPackageReferences(
            String draftVersionId,
            Set<String> linkedPackageIds
    ) {
        if (sampleRepo.countByDatasetVersionIdAndCreatedByPackageIdIsNull(
                draftVersionId
        ) > 0) {
            throw new IllegalArgumentException(
                    "dataset workspace sample packageId is missing"
            );
        }
        if (dataRepo.countByDatasetVersionIdAndPackageIdIsNull(draftVersionId) > 0) {
            throw new IllegalArgumentException(
                    "dataset workspace sample data packageId is missing"
            );
        }
        if (annotationRepo.countByDatasetVersionIdAndPackageIdIsNull(
                draftVersionId
        ) > 0) {
            throw new IllegalArgumentException(
                    "dataset workspace annotation packageId is missing"
            );
        }

        Set<String> referencedPackageIds = new LinkedHashSet<>();
        referencedPackageIds.addAll(
                sampleRepo.findDistinctCreatedByPackageIdsByDatasetVersionId(
                        draftVersionId
                )
        );
        referencedPackageIds.addAll(
                dataRepo.findDistinctPackageIdsByDatasetVersionId(draftVersionId)
        );
        referencedPackageIds.addAll(
                annotationRepo.findDistinctPackageIdsByDatasetVersionId(
                        draftVersionId
                )
        );
        for (String packageId : referencedPackageIds) {
            if (!linkedPackageIds.contains(packageId)) {
                throw new IllegalArgumentException(
                        "dataset workspace metadata references unlinked package: "
                                + packageId
                );
            }
        }
    }
}
