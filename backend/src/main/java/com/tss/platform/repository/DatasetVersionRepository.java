package com.tss.platform.repository;

import com.tss.platform.entity.DatasetVersion;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from DatasetVersion v where v.id = :id and v.deleted = false")
    Optional<DatasetVersion> findByIdAndDeletedFalseForUpdate(@Param("id") String id);

    Optional<DatasetVersion> findTopByAssetIdAndDeletedFalseOrderByCreatedAtDesc(String assetId);

    Optional<DatasetVersion> findByAssetIdAndVersionNoAndDeletedFalse(String assetId, Integer versionNo);

    List<DatasetVersion> findByAssetIdAndDeletedFalseOrderByVersionNoDesc(String assetId);

    Optional<DatasetVersion> findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(String assetId, String status);

    List<DatasetVersion> findByDeletedTrueAndDeletedAtBefore(java.time.Instant deletedBefore);

    long countByAssetIdAndDeletedFalse(String assetId);

    long countByParentVersionId(String parentVersionId);

    @Query("select coalesce(max(v.versionNo), 0) from DatasetVersion v where v.assetId = :assetId")
    Integer findMaxVersionNoByAssetId(@Param("assetId") String assetId);

    boolean existsByAssetIdAndVersion(String assetId, String version);

    boolean existsByAssetIdAndVersionAndIdNot(String assetId, String version, String id);

    boolean existsByStoragePathAndDeletedFalseAndIdNot(String storagePath, String id);
}

