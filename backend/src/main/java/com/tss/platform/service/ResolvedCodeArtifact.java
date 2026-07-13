package com.tss.platform.service;

import com.tss.platform.dto.v2.V2CodeConsumerManifest;

public record ResolvedCodeArtifact(
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
        String approvalRecordId,
        String storagePath
) {
    public V2CodeConsumerManifest toConsumerManifest() {
        return new V2CodeConsumerManifest(
                assetId,
                versionId,
                purpose,
                runtime,
                entryScript,
                trainingType,
                trainingProfile,
                artifactSha256,
                validationRunId,
                validationPolicyVersion,
                approvalRecordId
        );
    }
}
