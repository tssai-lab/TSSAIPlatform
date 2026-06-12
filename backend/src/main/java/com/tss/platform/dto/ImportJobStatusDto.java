package com.tss.platform.dto;

import lombok.Data;

import java.time.Instant;

@Data
public class ImportJobStatusDto {
    private String importJobId;
    private String datasetVersionId;
    private String status;
    private Integer progress;
    private Integer totalSamples;
    private Integer importedSamples;
    private String errorMessage;
    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;
}
