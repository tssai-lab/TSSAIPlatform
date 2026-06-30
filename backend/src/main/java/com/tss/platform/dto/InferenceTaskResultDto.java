package com.tss.platform.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

@Data
public class InferenceTaskResultDto {
    private String id;
    private String status;
    private Integer progress;
    private JsonNode result;
    private String logPath;
    private String outputPath;
    private String errorMessage;
}
