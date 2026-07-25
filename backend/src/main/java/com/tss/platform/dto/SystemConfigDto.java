package com.tss.platform.dto;

import java.time.Instant;

public record SystemConfigDto(
        String trainingCodeReviewMode,
        Instant updatedAt
) {
}
