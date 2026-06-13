package com.tss.platform.repository;

import com.tss.platform.entity.DatasetSampleData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface DatasetSampleDataRepository extends JpaRepository<DatasetSampleData, String> {
    long countByDatasetVersionIdAndPackageIdIsNull(String datasetVersionId);

    @Query("""
            select distinct d.packageId
            from DatasetSampleData d
            where d.datasetVersionId = :datasetVersionId
              and d.packageId is not null
            """)
    List<String> findDistinctPackageIdsByDatasetVersionId(
            @Param("datasetVersionId") String datasetVersionId
    );

    List<DatasetSampleData> findBySampleIdAndDatasetVersionIdOrderBySeqAscIdAsc(
            String sampleId,
            String datasetVersionId
    );

    List<DatasetSampleData>
            findByDatasetVersionIdAndSampleIdInOrderBySampleIdAscSeqAscIdAsc(
                    String datasetVersionId,
                    Collection<String> sampleIds
            );
}
