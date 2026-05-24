package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DatasetAssetRepository extends JpaRepository<DatasetAsset, String> {
    Optional<DatasetAsset> findByName(String name);
}

