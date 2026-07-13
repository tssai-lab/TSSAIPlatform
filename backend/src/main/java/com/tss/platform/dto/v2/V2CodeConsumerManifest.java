package com.tss.platform.dto.v2;

public record V2CodeConsumerManifest(
        String assetId,
        String versionId,
        String purpose,
        String runtime,
        String entryScript,
        String trainingType,
        String trainingProfile,
        String artifactSha256,
        String validationRunId,
        String validationPolicyVersion,
        String approvalRecordId
) {
}
