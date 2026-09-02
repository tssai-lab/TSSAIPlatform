package com.tss.platform.dto;

import lombok.Data;

/** Optional per-run overrides. Missing values preserve the selected plan profile. */
@Data
public class TrainingResourceRequest {
    private Double cpuCores;
    private Long memoryMiB;
    private Integer gpuCount;
    private Long gpuMemoryLimitMiB;
}
