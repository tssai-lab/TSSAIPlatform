package com.tss.platform.repository;

import com.tss.platform.entity.TrainingExperimentVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TrainingExperimentVersionRepository extends JpaRepository<TrainingExperimentVersion, String> {
    List<TrainingExperimentVersion> findByExperimentIdOrderByVersionNoAsc(String experimentId);

    Optional<TrainingExperimentVersion> findByExperimentIdAndVersionNo(String experimentId, Integer versionNo);

    Optional<TrainingExperimentVersion> findTopByExperimentIdOrderByVersionNoDesc(String experimentId);

    List<TrainingExperimentVersion> findAllByOrderByCreatedAtDesc();

    List<TrainingExperimentVersion> findAllByOwnerUserIdOrderByCreatedAtDesc(Integer ownerUserId);

    List<TrainingExperimentVersion> findTop20ByModelPublishStatusOrderByUpdatedAtAsc(String modelPublishStatus);

    void deleteByExperimentId(String experimentId);

    long countByModelVersionId(String modelVersionId);

    long countByModelVersionIdIn(Collection<String> modelVersionIds);

    long countByProducedModelVersionId(String modelVersionId);

    long countByProducedModelVersionIdIn(Collection<String> modelVersionIds);

    long countByDatasetVersionId(String datasetVersionId);

    long countByDatasetVersionIdIn(Collection<String> datasetVersionIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update TrainingExperimentVersion v
               set v.modelPublishStatus = 'PUBLISHING',
                   v.modelPublishError = null,
                   v.updatedAt = :now
             where v.id = :id
               and v.status = 'success'
               and v.producedModelVersionId is null
               and v.modelPublishStatus in :claimableStatuses
            """)
    int claimModelPublish(
            @Param("id") String id,
            @Param("claimableStatuses") Collection<String> claimableStatuses,
            @Param("now") Instant now
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update TrainingExperimentVersion v
               set v.modelPublishStatus = 'PENDING',
                   v.modelPublishError = :message,
                   v.updatedAt = :now
             where v.modelPublishStatus = 'PUBLISHING'
               and v.updatedAt < :staleBefore
               and v.producedModelVersionId is null
            """)
    int resetStaleModelPublishes(
            @Param("staleBefore") Instant staleBefore,
            @Param("message") String message,
            @Param("now") Instant now
    );

    // resource-monitor queue queries
    List<TrainingExperimentVersion> findByServerIpAndStatus(String serverIp, String status);

    List<TrainingExperimentVersion> findByServerIpAndStatusIn(String serverIp, List<String> statuses);

    List<TrainingExperimentVersion> findByServerIpNotNullAndStatusIn(List<String> statuses);

    List<TrainingExperimentVersion> findByStatus(String status);

    List<TrainingExperimentVersion> findByStatusAndServerIpIsNullOrderByPriorityAscCreatedAtAsc(String status);
}
