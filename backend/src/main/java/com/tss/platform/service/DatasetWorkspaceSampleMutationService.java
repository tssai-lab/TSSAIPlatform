package com.tss.platform.service;

import com.tss.platform.dto.DatasetWorkspaceSampleMutationDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class DatasetWorkspaceSampleMutationService {

    private static final String SAMPLE_NOT_FOUND =
            "dataset workspace sample not found or no permission";

    private final DatasetSampleRepository sampleRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final AuthContext authContext;

    public DatasetWorkspaceSampleMutationService(
            DatasetSampleRepository sampleRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            AuthContext authContext
    ) {
        this.sampleRepo = sampleRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.authContext = authContext;
    }

    @Transactional
    public DatasetWorkspaceSampleMutationDto deleteSample(String sampleId) {
        DatasetSample sample = requireMutableDraftSample(sampleId);
        if (!Boolean.TRUE.equals(sample.getDeleted())) {
            Instant now = Instant.now();
            sample.setDeleted(true);
            sample.setDeletedAt(now);
            sample.setUpdatedAt(now);
            sample = sampleRepo.saveAndFlush(sample);
        }
        return toDto(sample);
    }

    @Transactional
    public DatasetWorkspaceSampleMutationDto restoreSample(String sampleId) {
        DatasetSample sample = requireMutableDraftSample(sampleId);
        if (Boolean.TRUE.equals(sample.getDeleted())) {
            sample.setDeleted(false);
            sample.setDeletedAt(null);
            sample.setUpdatedAt(Instant.now());
            sample = sampleRepo.saveAndFlush(sample);
        }
        return toDto(sample);
    }

    private DatasetSample requireMutableDraftSample(String sampleId) {
        if (sampleId == null || sampleId.isBlank()) {
            throw new IllegalArgumentException(SAMPLE_NOT_FOUND);
        }
        DatasetSample sample = sampleRepo.findByIdForUpdate(sampleId)
                .orElseThrow(() -> new IllegalArgumentException(SAMPLE_NOT_FOUND));
        DatasetVersion version = versionRepo
                .findByIdAndDeletedFalse(sample.getDatasetVersionId())
                .orElseThrow(() -> new IllegalArgumentException(SAMPLE_NOT_FOUND));
        if (!"DRAFT".equals(version.getStatus())) {
            throw new IllegalArgumentException(SAMPLE_NOT_FOUND);
        }
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException(SAMPLE_NOT_FOUND));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new IllegalArgumentException(SAMPLE_NOT_FOUND);
        }
        return sample;
    }

    private static DatasetWorkspaceSampleMutationDto toDto(DatasetSample sample) {
        DatasetWorkspaceSampleMutationDto dto =
                new DatasetWorkspaceSampleMutationDto();
        dto.setSampleId(sample.getId());
        dto.setDatasetVersionId(sample.getDatasetVersionId());
        dto.setDeleted(Boolean.TRUE.equals(sample.getDeleted()));
        dto.setDeletedAt(sample.getDeletedAt());
        return dto;
    }
}
