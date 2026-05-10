package com.tss.platform.entity;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Getter
@Setter
@Entity
@Table(
        name = "training_experiment_version",
        indexes = {
                @Index(name = "idx_training_experiment_id", columnList = "experiment_id")
        },
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_training_experiment_version",
                        columnNames = {"experiment_id", "version_no"}
                )
        }
)
public class TrainingExperimentVersion {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "experiment_id", nullable = false, length = 64)
    private String experimentId;

    @Column(name = "version_no", nullable = false)
    private Integer versionNo;

    @Column(name = "name", length = 255)
    private String name;

    @Column(name = "model_version_id", length = 64)
    private String modelVersionId;

    @Column(name = "code_version_id", nullable = false, length = 128)
    private String codeVersionId;

    @Column(name = "dataset_version_id", nullable = false, length = 64)
    private String datasetVersionId;

    @Column(name = "hyper_params_json", columnDefinition = "TEXT")
    private String hyperParamsJson;

    @Column(name = "status", length = 32)
    private String status;

    @Column(name = "remark", length = 1024)
    private String remark;

    @Column(name = "owner_user_id")
    private Integer ownerUserId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
