package com.tss.platform.repository;

import com.tss.platform.entity.DatasetSampleData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface DatasetSampleDataRepository extends JpaRepository<DatasetSampleData, String> {
    long countByDatasetVersionId(String datasetVersionId);

    long countByDatasetVersionIdAndPackageIdIsNull(String datasetVersionId);

    @Query("""
            select count(d.id)
            from DatasetSampleData d
            where d.packageId = :packageId
              and exists (
                  select v.id
                  from DatasetVersion v
                  where v.id = d.datasetVersionId
                    and v.deleted = false
              )
            """)
    long countActiveByPackageId(@Param("packageId") String packageId);

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

    List<DatasetSampleData> findBySampleIdInOrderBySampleIdAscSeqAscIdAsc(
            Collection<String> sampleIds
    );
}
