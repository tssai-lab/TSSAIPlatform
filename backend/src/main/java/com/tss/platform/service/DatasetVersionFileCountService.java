package com.tss.platform.service;

import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAnnotationRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import org.springframework.stereotype.Service;

@Service
public class DatasetVersionFileCountService {

    private final DatasetSampleDataRepository dataRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final ZipCentralDirectoryReader zipReader;

    public DatasetVersionFileCountService(
            DatasetSampleDataRepository dataRepo,
            DatasetAnnotationRepository annotationRepo,
            ZipCentralDirectoryReader zipReader
    ) {
        this.dataRepo = dataRepo;
        this.annotationRepo = annotationRepo;
        this.zipReader = zipReader;
    }

    public Long countCurrentVersionFiles(DatasetAsset asset, DatasetVersion version) {
        if (version == null) {
            return null;
        }
        long metadataCount = dataRepo.countByDatasetVersionId(version.getId())
                + annotationRepo.countByDatasetVersionId(version.getId());
        if (asset != null && "MULTIMODAL".equalsIgnoreCase(asset.getType())) {
            return metadataCount;
        }
        if (metadataCount > 0) {
            return metadataCount;
        }
        if (isBlank(version.getStoragePath())) {
            return null;
        }
        if (!isZip(sourceName(version))) {
            return 1L;
        }
        if (version.getSizeBytes() == null) {
            return null;
        }
        try {
            return zipReader.read(version.getStoragePath(), version.getSizeBytes()).stream()
                    .filter(entry -> !entry.directory())
                    .count();
        } catch (Exception exception) {
            return null;
        }
    }

    private String sourceName(DatasetVersion version) {
        return !isBlank(version.getFileName())
                ? version.getFileName()
                : version.getStoragePath();
    }

    private boolean isZip(String path) {
        return path != null && path.toLowerCase().endsWith(".zip");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
