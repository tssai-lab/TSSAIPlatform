package com.tss.platform.repository;

import com.tss.platform.entity.DatasetVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DatasetVersionRepository extends JpaRepository<DatasetVersion, String> {
    List<DatasetVersion> findByAssetId(String assetId);

    List<DatasetVersion> findByAssetIdAndDeletedFalse(String assetId);

    List<DatasetVersion> findByAssetIdIn(Collection<String> assetIds);

    List<DatasetVersion> findByAssetIdInAndDeletedFalse(Collection<String> assetIds);

    List<DatasetVersion> findByDeletedFalse();

    List<DatasetVersion> findByOwnerUserId(Integer ownerUserId);

    List<DatasetVersion> findByOwnerUserIdAndDeletedFalse(Integer ownerUserId);

    List<DatasetVersion> findByAssetIdAndOwnerUserId(String assetId, Integer ownerUserId);

    List<DatasetVersion> findByAssetIdAndOwnerUserIdAndDeletedFalse(String assetId, Integer ownerUserId);

    Optional<DatasetVersion> findByIdAndDeletedFalse(String id);

    Optional<DatasetVersion> findTopByAssetIdAndDeletedFalseOrderByCreatedAtDesc(String assetId);

    boolean existsByAssetIdAndVersion(String assetId, String version);

    boolean existsByAssetIdAndVersionAndIdNot(String assetId, String version, String id);
}

