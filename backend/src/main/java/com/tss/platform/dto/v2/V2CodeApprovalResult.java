package com.tss.platform.dto.v2;

import com.tss.platform.entity.CodeApprovalRecord;

import java.time.Instant;

/** Public approval evidence projection. Reviewer identity is intentionally omitted. */
public record V2CodeApprovalResult(
        String approvalRecordId,
        String versionId,
        String decision,
        String reason,
        String artifactSha256,
        String validationRunId,
        String policyVersion,
        Instant createdAt
) {

    public static V2CodeApprovalResult from(CodeApprovalRecord record) {
        if (record == null) {
            throw new IllegalArgumentException("Code approval record is required");
        }
        return new V2CodeApprovalResult(
                record.getId(),
                record.getVersionId(),
                record.getDecision(),
                record.getReason(),
                record.getArtifactSha256(),
                record.getValidationRunId(),
                record.getPolicyVersion(),
                record.getCreatedAt()
        );
    }
}
