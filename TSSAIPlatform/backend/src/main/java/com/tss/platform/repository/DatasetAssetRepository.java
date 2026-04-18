package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAsset;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DatasetAssetRepository extends JpaRepository<DatasetAsset, String> {
}

