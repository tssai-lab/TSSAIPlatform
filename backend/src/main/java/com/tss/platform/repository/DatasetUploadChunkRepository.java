package com.tss.platform.repository;

import com.tss.platform.entity.DatasetUploadChunk;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DatasetUploadChunkRepository extends JpaRepository<DatasetUploadChunk, String> {
    List<DatasetUploadChunk> findByUploadIdOrderByPartIndexAsc(String uploadId);

    Optional<DatasetUploadChunk> findByUploadIdAndPartIndex(String uploadId, Integer partIndex);

    long countByUploadId(String uploadId);

    void deleteByUploadId(String uploadId);
}
