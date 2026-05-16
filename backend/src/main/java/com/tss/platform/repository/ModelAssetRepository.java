package com.tss.platform.repository;

import com.tss.platform.entity.ModelAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ModelAssetRepository extends JpaRepository<ModelAsset, String> {
    Optional<ModelAsset> findByName(String name);

    Optional<ModelAsset> findByIdAndDeletedFalse(String id);

    Optional<ModelAsset> findByNameAndDeletedFalse(String name);

    List<ModelAsset> findByDeletedFalse();

    List<ModelAsset> findByOwnerUserId(Integer ownerUserId);

    List<ModelAsset> findByOwnerUserIdAndDeletedFalse(Integer ownerUserId);
}

