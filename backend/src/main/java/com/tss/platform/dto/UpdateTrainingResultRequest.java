package com.tss.platform.dto;

import lombok.Data;

import java.time.Instant;

@Data
public class UpdateTrainingResultRequest {
    private String status;
    private Integer progress;
    private Object metrics;
    private String runId;
    private String logPath;
    private String outputPath;
    private String errorMessage;
    private Instant startedAt;
    private Instant finishedAt;
    private String remark;
}
