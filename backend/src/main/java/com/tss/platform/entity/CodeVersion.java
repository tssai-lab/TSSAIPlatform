package com.tss.platform.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(
        name = "code_version",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_code_version_asset_version",
                        columnNames = {"asset_id", "version"}
                )
        }
)
public class CodeVersion {

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

    @Column(name = "status", nullable = false, length = 32)
    private String status = "READY";

    @Column(name = "approval_status", nullable = false, length = 32)
    private String approvalStatus = "PENDING";

    @Column(name = "owner_user_id")
    private Integer ownerUserId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "deleted", nullable = false)
    private Boolean deleted = false;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
