package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAnnotation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface DatasetAnnotationRepository extends JpaRepository<DatasetAnnotation, String> {
    long countByDatasetVersionId(String datasetVersionId);

    long countByDatasetVersionIdAndPackageIdIsNull(String datasetVersionId);

    @Query("""
            select distinct a.packageId
            from DatasetAnnotation a
            where a.datasetVersionId = :datasetVersionId
              and a.packageId is not null
            """)
    List<String> findDistinctPackageIdsByDatasetVersionId(
            @Param("datasetVersionId") String datasetVersionId
    );

    List<DatasetAnnotation> findBySampleIdAndDatasetVersionIdOrderByCreatedAtAscIdAsc(
            String sampleId,
            String datasetVersionId
    );

    List<DatasetAnnotation>
            findByDatasetVersionIdAndSampleIdInOrderBySampleIdAscCreatedAtAscIdAsc(
                    String datasetVersionId,
                    Collection<String> sampleIds
            );
}
