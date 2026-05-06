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
    private String datasetVersionId;
    private JsonNode hyperParams;
    private String status;
    private Integer progress;
    private String remark;
    private Instant createdAt;
    private Instant updatedAt;

    public String getCreateTime() {
        return createdAt != null ? createdAt.toString() : null;
    }
}
