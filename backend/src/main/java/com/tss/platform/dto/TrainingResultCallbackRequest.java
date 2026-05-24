package com.tss.platform.dto;

import lombok.Data;

@Data
public class TrainingResultCallbackRequest {
    private String trainingId;
    private String status;
    private Integer progress;
    private String runId;
    private Object metrics;
    private String logPath;
    private String outputPath;
    private String errorSummary;
}
