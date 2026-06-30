package com.tss.platform.repository;

import com.tss.platform.entity.InferenceTask;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InferenceTaskRepository extends JpaRepository<InferenceTask, String> {
    Optional<InferenceTask> findById(String id);

    Page<InferenceTask> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<InferenceTask> findAllByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    Page<InferenceTask> findAllByOwnerUserIdOrderByCreatedAtDesc(Integer ownerUserId, Pageable pageable);

    Page<InferenceTask> findAllByOwnerUserIdAndStatusOrderByCreatedAtDesc(
            Integer ownerUserId,
            String status,
            Pageable pageable
    );
}
