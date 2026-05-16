package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DatasetAssetRepository extends JpaRepository<DatasetAsset, String> {
    Optional<DatasetAsset> findByIdAndDeletedFalse(String id);

    List<DatasetAsset> findByDeletedFalse();

    List<DatasetAsset> findByOwnerUserId(Integer ownerUserId);

    List<DatasetAsset> findByOwnerUserIdAndDeletedFalse(Integer ownerUserId);
}

