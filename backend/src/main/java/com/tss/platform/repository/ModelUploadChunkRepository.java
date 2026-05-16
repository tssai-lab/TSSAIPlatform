package com.tss.platform.repository;

import com.tss.platform.entity.ModelUploadChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface ModelUploadChunkRepository extends JpaRepository<ModelUploadChunk, String> {
    List<ModelUploadChunk> findByUploadIdOrderByPartIndexAsc(String uploadId);

    Optional<ModelUploadChunk> findByUploadIdAndPartIndex(String uploadId, Integer partIndex);

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void deleteByUploadId(String uploadId);
}
