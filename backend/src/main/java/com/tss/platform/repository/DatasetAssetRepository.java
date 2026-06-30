package com.tss.platform.repository;

import com.tss.platform.entity.DatasetAsset;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    @Query(
            value = """
                    select a
                    from DatasetAsset a
                    where a.deleted = false
                      and (:type is null or a.type = :type)
                      and (
                            :keyword is null
                            or lower(a.name) like concat('%', :keyword, '%')
                            or lower(coalesce(a.remark, '')) like concat('%', :keyword, '%')
                            or exists (
                                select v.id
                                from DatasetVersion v
                                where v.assetId = a.id
                                  and v.deleted = false
                                  and (
                                        lower(coalesce(v.version, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.versionLabel, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.remark, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.description, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.fileName, '')) like concat('%', :keyword, '%')
                                  )
                            )
                      )
                    order by coalesce(a.updatedAt, a.createdAt) desc, a.id asc
                    """,
            countQuery = """
                    select count(a)
                    from DatasetAsset a
                    where a.deleted = false
                      and (:type is null or a.type = :type)
                      and (
                            :keyword is null
                            or lower(a.name) like concat('%', :keyword, '%')
                            or lower(coalesce(a.remark, '')) like concat('%', :keyword, '%')
                            or exists (
                                select v.id
                                from DatasetVersion v
                                where v.assetId = a.id
                                  and v.deleted = false
                                  and (
                                        lower(coalesce(v.version, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.versionLabel, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.remark, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.description, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.fileName, '')) like concat('%', :keyword, '%')
                                  )
                            )
                      )
                    """
    )
    Page<DatasetAsset> searchCatalogForAdmin(
            @Param("type") String type,
            @Param("keyword") String keyword,
            Pageable pageable
    );

    @Query(
            value = """
                    select a
                    from DatasetAsset a
                    where a.deleted = false
                      and a.ownerUserId = :ownerUserId
                      and (:type is null or a.type = :type)
                      and (
                            :keyword is null
                            or lower(a.name) like concat('%', :keyword, '%')
                            or lower(coalesce(a.remark, '')) like concat('%', :keyword, '%')
                            or exists (
                                select v.id
                                from DatasetVersion v
                                where v.assetId = a.id
                                  and v.deleted = false
                                  and (
                                        lower(coalesce(v.version, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.versionLabel, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.remark, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.description, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.fileName, '')) like concat('%', :keyword, '%')
                                  )
                            )
                      )
                    order by coalesce(a.updatedAt, a.createdAt) desc, a.id asc
                    """,
            countQuery = """
                    select count(a)
                    from DatasetAsset a
                    where a.deleted = false
                      and a.ownerUserId = :ownerUserId
                      and (:type is null or a.type = :type)
                      and (
                            :keyword is null
                            or lower(a.name) like concat('%', :keyword, '%')
                            or lower(coalesce(a.remark, '')) like concat('%', :keyword, '%')
                            or exists (
                                select v.id
                                from DatasetVersion v
                                where v.assetId = a.id
                                  and v.deleted = false
                                  and (
                                        lower(coalesce(v.version, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.versionLabel, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.remark, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.description, '')) like concat('%', :keyword, '%')
                                        or lower(coalesce(v.fileName, '')) like concat('%', :keyword, '%')
                                  )
                            )
                      )
                    """
    )
    Page<DatasetAsset> searchCatalogForOwner(
            @Param("ownerUserId") Integer ownerUserId,
            @Param("type") String type,
            @Param("keyword") String keyword,
            Pageable pageable
    );
}

