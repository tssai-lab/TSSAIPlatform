package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAnnotation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DatasetAnnotationRepository extends JpaRepository<DatasetAnnotation, String> {
    List<DatasetAnnotation> findBySampleIdAndDatasetVersionIdOrderByCreatedAtAscIdAsc(
            String sampleId,
            String datasetVersionId
    );
}
