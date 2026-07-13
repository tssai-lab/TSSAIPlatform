package com.tss.platform.dto.v2;

import java.time.Instant;

/** Public code-asset projection. Persistence and storage fields stay internal. */
public record V2CodeAssetDto(
        String id,
        String name,
        String trainingProfile,
        String purpose,
        String runtime,
        String entryScript,
        String trainingType,
        String remark,
        long assetRevision,
        Instant createdAt,
        Instant updatedAt,
        boolean hasOpenWorkspace
) {
}
