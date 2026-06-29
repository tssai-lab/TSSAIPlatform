package com.tss.platform.dto.v2;

import lombok.Data;

import java.time.Instant;

@Data
public class V2DatasetPublishResult {
    private String datasetId;
    private String currentVersion;
    private String status;
    private Instant publishedAt;
}
