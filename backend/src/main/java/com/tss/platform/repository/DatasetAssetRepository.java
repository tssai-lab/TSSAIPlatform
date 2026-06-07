package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAsset;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DatasetAssetRepository extends JpaRepository<DatasetAsset, String> {
    Optional<DatasetAsset> findByIdAndDeletedFalse(String id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from DatasetAsset a where a.id = :id and a.deleted = false")
    Optional<DatasetAsset> findByIdAndDeletedFalseForUpdate(@Param("id") String id);

    List<DatasetAsset> findByDeletedFalse();

    List<DatasetAsset> findByOwnerUserId(Integer ownerUserId);

    List<DatasetAsset> findByOwnerUserIdAndDeletedFalse(Integer ownerUserId);
}

