package com.tss.platform.repository;

import com.tss.platform.entity.TrainingExperimentVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TrainingExperimentVersionRepository extends JpaRepository<TrainingExperimentVersion, String> {
    List<TrainingExperimentVersion> findByExperimentIdOrderByVersionNoAsc(String experimentId);

    Optional<TrainingExperimentVersion> findByExperimentIdAndVersionNo(String experimentId, Integer versionNo);

    Optional<TrainingExperimentVersion> findTopByExperimentIdOrderByVersionNoDesc(String experimentId);

    List<TrainingExperimentVersion> findAllByOrderByCreatedAtDesc();

    void deleteByExperimentId(String experimentId);
}
