package com.tss.platform.service;

import com.tss.platform.dto.ImportJobStatusDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ImportJobQueryService {

    private final ImportJobRepository importJobRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final AuthContext authContext;

    public ImportJobQueryService(
            ImportJobRepository importJobRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            AuthContext authContext
    ) {
        this.importJobRepo = importJobRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.authContext = authContext;
    }

    @Transactional(readOnly = true)
    public ImportJobStatusDto getStatus(String importJobId) {
        if (importJobId == null || importJobId.isBlank()) {
            throw new IllegalArgumentException("importJobId 不能为空");
        }
        ImportJob job = importJobRepo.findById(importJobId)
                .orElseThrow(() -> new IllegalArgumentException("importJob not found or no permission"));
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(job.getDatasetVersionId())
                .orElseThrow(() -> new IllegalArgumentException("importJob not found or no permission"));
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("importJob not found or no permission"));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new IllegalArgumentException("importJob not found or no permission");
        }

        ImportJobStatusDto dto = new ImportJobStatusDto();
        dto.setImportJobId(job.getId());
        dto.setDatasetVersionId(job.getDatasetVersionId());
        dto.setStatus(job.getStatus());
        dto.setProgress(job.getProgress());
        dto.setTotalSamples(job.getTotalSamples());
        dto.setImportedSamples(job.getImportedSamples());
        dto.setErrorMessage(job.getErrorMessage());
        dto.setCreatedAt(job.getCreatedAt());
        dto.setStartedAt(job.getStartedAt());
        dto.setFinishedAt(job.getFinishedAt());
        return dto;
    }
}
