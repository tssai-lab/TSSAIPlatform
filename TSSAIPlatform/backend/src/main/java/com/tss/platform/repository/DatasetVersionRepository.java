package com.tss.platform.repository;

import com.tss.platform.entity.DatasetVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DatasetVersionRepository extends JpaRepository<DatasetVersion, String> {
    List<DatasetVersion> findByAssetId(String assetId);
}

