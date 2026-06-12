package com.tss.platform.repository;

import com.tss.platform.entity.DatasetSample;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DatasetSampleRepository extends JpaRepository<DatasetSample, String> {
    Page<DatasetSample> findByDatasetVersionIdAndDeletedFalse(
            String datasetVersionId,
            Pageable pageable
    );

    Optional<DatasetSample> findByIdAndDeletedFalse(String id);
}
