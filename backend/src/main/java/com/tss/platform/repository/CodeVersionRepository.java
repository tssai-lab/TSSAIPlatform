package com.tss.platform.repository;

import com.tss.platform.entity.CodeVersion;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.Optional;
import java.util.List;

public interface CodeVersionRepository extends JpaRepository<CodeVersion, String> {

    Optional<CodeVersion> findByIdAndDeletedFalse(String id);

    Optional<CodeVersion> findByIdAndAssetIdAndDeletedFalse(String id, String assetId);

    @Query("select v.assetId from CodeVersion v where v.id = :id and v.deleted = false")
    Optional<String> findAssetIdByIdAndDeletedFalse(@Param("id") String id);

    boolean existsByAssetIdAndVersion(String assetId, String version);

    boolean existsByAssetIdAndVersionAndDeletedFalse(String assetId, String version);

    boolean existsByAssetIdAndDeletedFalse(String assetId);

    List<CodeVersion> findByDeletedFalseOrderByCreatedAtDesc();

    List<CodeVersion> findByAssetIdAndDeletedFalseOrderByCreatedAtDesc(String assetId);

    @Query("select v from CodeVersion v, CodeAsset a "
            + "where a.id = v.assetId "
            + "and a.deleted = false "
            + "and v.deleted = false "
            + "and v.approvalStatus = :approvalStatus "
            + "and (:riskLevel is null or v.riskLevel = :riskLevel) "
            + "and (:ownerUserId is null or v.ownerUserId = :ownerUserId) "
            + "and (:keyword is null "
            + "or lower(a.name) like lower(concat('%', :keyword, '%')) "
            + "or lower(v.version) like lower(concat('%', :keyword, '%'))) "
            + "and (:submittedFrom is null or v.createdAt >= :submittedFrom) "
            + "and (:submittedTo is null or v.createdAt <= :submittedTo)")
    Page<CodeVersion> findCodeReviewTasks(
            @Param("approvalStatus") String approvalStatus,
            @Param("riskLevel") String riskLevel,
            @Param("ownerUserId") Integer ownerUserId,
            @Param("keyword") String keyword,
            @Param("submittedFrom") Instant submittedFrom,
            @Param("submittedTo") Instant submittedTo,
            Pageable pageable
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from CodeVersion v where v.id = :id and v.deleted = false")
    Optional<CodeVersion> findByIdAndDeletedFalseForUpdate(@Param("id") String id);
}
