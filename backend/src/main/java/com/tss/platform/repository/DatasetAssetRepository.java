package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DatasetAssetRepository extends JpaRepository<DatasetAsset, String> {
    List<DatasetAsset> findByOwnerUserId(Integer ownerUserId);
}

