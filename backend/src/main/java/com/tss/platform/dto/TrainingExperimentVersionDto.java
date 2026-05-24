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
    private String modelName;
    private String codeVersionId;
    private String datasetVersionId;
    private String datasetName;
    private JsonNode hyperParams;
    private JsonNode metrics;
    private String status;
    private Integer progress;
    private String runId;
    private String logPath;
    private String outputPath;
    private String errorSummary;
    private String k8sJobName;
    private String k8sNamespace;
    private String remark;
    private Instant createdAt;
    private Instant updatedAt;

    public String getCreateTime() {
        return createdAt != null ? createdAt.toString() : null;
    }
}
