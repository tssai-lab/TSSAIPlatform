package com.tss.platform.repository;

import com.tss.platform.entity.CodeVersion;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface CodeVersionRepository extends JpaRepository<CodeVersion, String> {

    Optional<CodeVersion> findByIdAndDeletedFalse(String id);

    List<CodeVersion> findByDeletedFalseOrderByCreatedAtDesc();

    List<CodeVersion> findByAssetIdAndDeletedFalseOrderByCreatedAtDesc(String assetId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from CodeVersion v where v.id = :id and v.deleted = false")
    Optional<CodeVersion> findByIdAndDeletedFalseForUpdate(@Param("id") String id);
}
