package com.tss.platform.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(
        name = "import_job",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_import_job_dataset_version",
                columnNames = "dataset_version_id"
        ),
        indexes = {
                @Index(name = "idx_ij_version", columnList = "dataset_version_id"),
                @Index(name = "idx_ij_status", columnList = "status")
        }
)
public class ImportJob {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "dataset_version_id", nullable = false, length = 64)
    private String datasetVersionId;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "progress", nullable = false)
    private Integer progress = 0;

    @Column(name = "total_samples")
    private Integer totalSamples;

    @Column(name = "imported_samples", nullable = false)
    private Integer importedSamples = 0;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "heartbeat_at")
    private Instant heartbeatAt;

    @Column(name = "executor_id", length = 64)
    private String executorId;

    @Column(name = "owner_user_id")
    private Integer ownerUserId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;
}
