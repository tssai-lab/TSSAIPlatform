package com.tss.platform.repository;

import com.tss.platform.entity.DatasetSampleData;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DatasetSampleDataRepository extends JpaRepository<DatasetSampleData, String> {
    List<DatasetSampleData> findBySampleIdAndDatasetVersionIdOrderBySeqAscIdAsc(
            String sampleId,
            String datasetVersionId
    );
}
