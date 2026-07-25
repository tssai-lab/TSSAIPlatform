package com.tss.platform.repository;

import com.tss.platform.entity.CodeAsset;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CodeAssetRepository extends JpaRepository<CodeAsset, String>,
        JpaSpecificationExecutor<CodeAsset> {

    Optional<CodeAsset> findByIdAndDeletedFalse(String id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from CodeAsset a where a.id = :id and a.deleted = false")
    Optional<CodeAsset> findByIdAndDeletedFalseForUpdate(@Param("id") String id);

    List<CodeAsset> findByOwnerUserIdAndDeletedFalseOrderByCreatedAtDesc(Integer ownerUserId);
}
