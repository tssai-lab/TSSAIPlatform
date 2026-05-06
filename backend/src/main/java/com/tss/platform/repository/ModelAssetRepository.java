package com.tss.platform.repository;

import com.tss.platform.entity.ModelAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ModelAssetRepository extends JpaRepository<ModelAsset, String> {
    Optional<ModelAsset> findByName(String name);
}

