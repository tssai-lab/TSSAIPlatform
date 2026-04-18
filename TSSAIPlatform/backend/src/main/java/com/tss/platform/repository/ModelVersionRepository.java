package com.tss.platform.repository;

import com.tss.platform.entity.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ModelVersionRepository extends JpaRepository<ModelVersion, String> {
    List<ModelVersion> findByAssetId(String assetId);
}

