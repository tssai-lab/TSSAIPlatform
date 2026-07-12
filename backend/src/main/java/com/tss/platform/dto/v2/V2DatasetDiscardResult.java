package com.tss.platform.dto.v2;

import lombok.Data;

import java.time.Instant;

@Data
public class V2DatasetDiscardResult {
    private String editSessionId;
    private String datasetId;
    private String status;
    private Instant discardedAt;
}
