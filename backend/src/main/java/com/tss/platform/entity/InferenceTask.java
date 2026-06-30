package com.tss.platform.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "inference_task")
public class InferenceTask {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "name", length = 255)
    private String name;

    @Column(name = "model_version_id", nullable = false, length = 64)
    private String modelVersionId;

    @Column(name = "script_version_id", nullable = false, length = 64)
    private String scriptVersionId;

    @Column(name = "input_mode", nullable = false, length = 32)
    private String inputMode;

    @Column(name = "dataset_version_id", length = 64)
    private String datasetVersionId;

    @Column(name = "input_object_name", length = 1024)
    private String inputObjectName;

    @Column(name = "params_json", columnDefinition = "TEXT")
    private String paramsJson;

    @Column(name = "status", length = 32)
    private String status;

    @Column(name = "progress")
    private Integer progress;

    @Column(name = "result_json", columnDefinition = "TEXT")
    private String resultJson;

    @Column(name = "log_path", length = 1024)
    private String logPath;

    @Column(name = "output_path", length = 1024)
    private String outputPath;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "remark", length = 1024)
    private String remark;

    @Column(name = "owner_user_id")
    private Integer ownerUserId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
