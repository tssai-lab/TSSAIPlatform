package com.tss.platform.dto.resource;

import com.tss.platform.training.plan.TrainingPlanDefinition;

import java.time.Instant;

/** One detected and currently schedulable hardware model compatible with a training plan. */
public record TrainingHardwareOptionDto(
        String hardwareTargetId,
        String displayName,
        String resourceProfileId,
        TrainingPlanDefinition.DeviceType deviceType,
        CpuBounds cpu,
        MemoryBounds memory,
        Integer gpuCount,
        Integer eligibleNodeCount,
        GpuCapability gpu,
        DataStatus dataStatus,
        Instant observedAt,
        String message
) {
    public record CpuBounds(double requestCores, double limitCores) {
    }

    public record MemoryBounds(long requestMiB, long limitMiB) {
    }

    public record GpuCapability(
            String model,
            int observedGpuCount,
            Long safeTotalMemoryMiB,
            Long maxFreeMemoryMiB,
            boolean metricsComplete
    ) {
    }

    public enum DataStatus {
        AVAILABLE,
        PARTIAL,
        UNAVAILABLE
    }
}
