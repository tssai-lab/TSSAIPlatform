package com.tss.platform.entity;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Getter
@Setter
@Entity
@Table(
        name = "dataset_version",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_dataset_version_asset_version",
                        columnNames = {"asset_id", "version"}
                )
        }
)
public class DatasetVersion {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "asset_id", nullable = false, length = 64)
    private String assetId;

    @Column(name = "version", nullable = false, length = 64)
    private String version;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "storage_path", length = 1024)
    private String storagePath;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "cv_task_type", length = 64)
    private String cvTaskType;

    @Column(name = "annotation_format", length = 64)
    private String annotationFormat;

    @Column(name = "remark", length = 1024)
    private String remark;

    @Column(name = "owner_user_id")
    private Integer ownerUserId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "deleted", nullable = false)
    private Boolean deleted = false;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}

