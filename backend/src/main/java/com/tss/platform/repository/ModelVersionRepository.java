package com.tss.platform.repository;

import com.tss.platform.entity.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ModelVersionRepository extends JpaRepository<ModelVersion, String> {
    List<ModelVersion> findByAssetId(String assetId);

    Optional<ModelVersion> findTopByAssetIdOrderByCreatedAtDesc(String assetId);
}

