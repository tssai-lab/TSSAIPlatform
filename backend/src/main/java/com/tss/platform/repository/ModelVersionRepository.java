package com.tss.platform.repository;

import com.tss.platform.entity.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ModelVersionRepository extends JpaRepository<ModelVersion, String> {
    List<ModelVersion> findByAssetId(String assetId);

    List<ModelVersion> findByAssetIdAndDeletedFalse(String assetId);

    List<ModelVersion> findByAssetIdIn(Collection<String> assetIds);

    List<ModelVersion> findByAssetIdInAndDeletedFalse(Collection<String> assetIds);

    List<ModelVersion> findByDeletedFalse();

    List<ModelVersion> findByOwnerUserId(Integer ownerUserId);

    List<ModelVersion> findByOwnerUserIdAndDeletedFalse(Integer ownerUserId);

    List<ModelVersion> findByAssetIdAndOwnerUserId(String assetId, Integer ownerUserId);

    List<ModelVersion> findByAssetIdAndOwnerUserIdAndDeletedFalse(String assetId, Integer ownerUserId);

    Optional<ModelVersion> findByIdAndDeletedFalse(String id);

    boolean existsByAssetIdAndVersion(String assetId, String version);

    boolean existsByAssetIdAndVersionAndIdNot(String assetId, String version, String id);
}

