package com.tss.platform.repository;

import com.tss.platform.entity.DatasetVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DatasetVersionRepository extends JpaRepository<DatasetVersion, String> {
    List<DatasetVersion> findByAssetId(String assetId);

    Optional<DatasetVersion> findTopByAssetIdOrderByCreatedAtDesc(String assetId);
}

