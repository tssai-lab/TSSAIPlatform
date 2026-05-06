package com.tss.platform.entity;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;

@Getter
@Setter
@Entity
@Table(
        name = "model_upload_session",
        indexes = {
                @Index(name = "idx_model_upload_fingerprint", columnList = "file_fingerprint"),
                @Index(name = "idx_model_upload_status", columnList = "status")
        }
)
public class ModelUploadSession {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "file_fingerprint", length = 512)
    private String fileFingerprint;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "chunk_size", nullable = false)
    private Integer chunkSize;

    @Column(name = "total_chunks", nullable = false)
    private Integer totalChunks;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "storage_path", length = 1024)
    private String storagePath;

    @Column(name = "asset_id", length = 64)
    private String assetId;

    @Column(name = "version_id", length = 64)
    private String versionId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
