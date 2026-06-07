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
        name = "dataset_upload_session",
        indexes = {
                @Index(name = "idx_dataset_upload_fingerprint", columnList = "file_fingerprint"),
                @Index(name = "idx_dataset_upload_status", columnList = "status")
        }
)
public class DatasetUploadSession {

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

    @Column(name = "dataset_name", nullable = false, length = 255)
    private String datasetName;

    @Column(name = "dataset_version", nullable = false, length = 64)
    private String version;

    @Column(name = "version_label", length = 64)
    private String versionLabel;

    @Column(name = "version_no")
    private Integer versionNo;

    @Column(name = "version_label_generated", nullable = false)
    private Boolean versionLabelGenerated = false;

    @Column(name = "task_type", nullable = false, length = 16)
    private String type;

    @Column(name = "cv_task_type", length = 64)
    private String cvTaskType;

    @Column(name = "annotation_format", length = 64)
    private String annotationFormat;

    @Column(name = "remark", length = 1024)
    private String remark;

    @Column(name = "description", length = 2048)
    private String description;

    @Column(name = "change_log")
    private String changeLog;

    @Column(name = "parent_version_id", length = 64)
    private String parentVersionId;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "storage_path", length = 1024)
    private String storagePath;

    @Column(name = "asset_id", length = 64)
    private String assetId;

    @Column(name = "version_id", length = 64)
    private String versionId;

    @Column(name = "owner_user_id")
    private Integer ownerUserId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
