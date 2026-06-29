package com.tss.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.Instant;

@Data
public class TrainingExperimentVersionDto {
    private String id;
    private String experimentId;
    private Integer versionNo;
    private String name;
    private String modelVersionId;
    private String codeVersionId;
    private String trainingProfile;
    private String datasetVersionId;
    private JsonNode hyperParams;
    private String status;
    private Integer progress;
    private JsonNode metrics;
    private String runId;
    private String mlflowExperimentId;
    private String mlflowTrackingUri;
    private String logPath;
    private String outputPath;
    private String errorMessage;
    private Instant startedAt;
    private Instant finishedAt;
    private String remark;
    private Integer ownerUserId;
    private Instant createdAt;
    private Instant updatedAt;

    public String getCreateTime() {
        return createdAt != null ? createdAt.toString() : null;
    }
}
