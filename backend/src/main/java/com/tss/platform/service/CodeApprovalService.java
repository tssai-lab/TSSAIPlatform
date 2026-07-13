package com.tss.platform.service;

import com.tss.platform.entity.CodeApprovalRecord;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeValidationRun;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.model.CodeApprovalStatus;
import com.tss.platform.repository.CodeApprovalRecordRepository;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeValidationRunRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Service
public class CodeApprovalService {

    public enum Decision {
        APPROVE,
        REJECT,
        REVOKE
    }

    private final CodeVersionRepository versionRepository;
    private final CodeAssetRepository assetRepository;
    private final CodeValidationRunRepository validationRunRepository;
    private final CodeApprovalRecordRepository approvalRecordRepository;
    private final CodeAssetAuditService auditService;
    private final AuthContext authContext;

    public CodeApprovalService(
            CodeVersionRepository versionRepository,
            CodeAssetRepository assetRepository,
            CodeValidationRunRepository validationRunRepository,
            CodeApprovalRecordRepository approvalRecordRepository,
            CodeAssetAuditService auditService,
            AuthContext authContext
    ) {
        this.versionRepository = versionRepository;
        this.assetRepository = assetRepository;
        this.validationRunRepository = validationRunRepository;
        this.approvalRecordRepository = approvalRecordRepository;
        this.auditService = auditService;
        this.authContext = authContext;
    }

    @Transactional
    public CodeApprovalRecord decide(String versionId, Decision decision, String reason) {
        if (!hasAdministratorAuthority()) {
            throw new CodeApprovalForbiddenException();
        }
        if (decision == null) {
            throw validation("APPROVAL_DECISION_REQUIRED", "Approval decision is required");
        }

        String assetId = versionRepository.findAssetIdByIdAndDeletedFalse(versionId)
                .orElseThrow(CodeAssetAccessException::new);
        CodeAsset asset = assetRepository.findByIdAndDeletedFalseForUpdate(assetId)
                .orElseThrow(CodeAssetAccessException::new);
        CodeVersion version = versionRepository.findByIdAndDeletedFalseForUpdate(versionId)
                .orElseThrow(CodeAssetAccessException::new);
        if (asset.getOwnerUserId() == null
                || !Objects.equals(asset.getId(), version.getAssetId())
                || !Objects.equals(asset.getOwnerUserId(), version.getOwnerUserId())) {
            throw new CodeAssetAccessException();
        }

        return switch (decision) {
            case APPROVE -> approve(asset, version);
            case REJECT -> reject(asset, version, sanitizeRequiredReason(reason));
            case REVOKE -> revoke(asset, version, sanitizeRequiredReason(reason));
        };
    }

    private boolean hasAdministratorAuthority() {
        try {
            return authContext.isAdmin();
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private CodeApprovalRecord approve(CodeAsset asset, CodeVersion version) {
        String status = version.getApprovalStatus();
        if (CodeApprovalStatus.REJECTED.equals(status)
                || CodeApprovalStatus.REVOKED.equals(status)) {
            throw validation("APPROVAL_TERMINAL", "Code version approval is terminal");
        }
        if (!CodeApprovalStatus.PENDING.equals(status)
                && !CodeApprovalStatus.APPROVED.equals(status)) {
            throw validation("APPROVAL_STATE_INVALID", "Code version approval state is invalid");
        }
        if (!"READY".equals(version.getStatus())) {
            throw validation("VERSION_NOT_READY", "Code version is not ready");
        }

        CodeValidationRun validationRun = validationRunRepository
                .findTopByVersionIdOrderByCreatedAtDescIdDesc(version.getId())
                .orElseThrow(() -> validation(
                        "VALIDATION_EVIDENCE_MISSING",
                        "Passing validation evidence is required"
                ));
        requireCurrentPassingEvidence(version, validationRun);

        CodeApprovalRecord latest = approvalRecordRepository
                .findTopByVersionIdOrderByCreatedAtDescIdDesc(version.getId())
                .orElse(null);
        if (latest != null
                && (CodeApprovalStatus.REJECTED.equals(latest.getDecision())
                || CodeApprovalStatus.REVOKED.equals(latest.getDecision()))) {
            throw validation("APPROVAL_TERMINAL", "Code version approval is terminal");
        }
        if (CodeApprovalStatus.APPROVED.equals(status)
                && exactApprovedEvidence(latest, version, validationRun)) {
            return latest;
        }

        CodeApprovalRecord record = newRecord(
                version,
                CodeApprovalStatus.APPROVED,
                null,
                validationRun
        );
        approvalRecordRepository.saveAndFlush(record);
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);
        version.setUpdatedAt(Instant.now());
        versionRepository.saveAndFlush(version);
        auditService.approved(
                asset.getId(),
                version.getId(),
                version.getArtifactSha256(),
                CodeArtifactAssembler.POLICY_VERSION
        );
        return record;
    }

    private CodeApprovalRecord reject(CodeAsset asset, CodeVersion version, String reason) {
        if (!CodeApprovalStatus.PENDING.equals(version.getApprovalStatus())) {
            throw validation("APPROVAL_TERMINAL", "Code version cannot be rejected");
        }
        CodeApprovalRecord record = newRecord(
                version,
                CodeApprovalStatus.REJECTED,
                reason,
                null
        );
        approvalRecordRepository.saveAndFlush(record);
        version.setApprovalStatus(CodeApprovalStatus.REJECTED);
        version.setUpdatedAt(Instant.now());
        versionRepository.saveAndFlush(version);
        auditService.rejected(asset.getId(), version.getId());
        return record;
    }

    private CodeApprovalRecord revoke(CodeAsset asset, CodeVersion version, String reason) {
        if (!CodeApprovalStatus.APPROVED.equals(version.getApprovalStatus())) {
            throw validation("APPROVAL_STATE_INVALID", "Only approved code versions can be revoked");
        }
        CodeApprovalRecord record = newRecord(
                version,
                CodeApprovalStatus.REVOKED,
                reason,
                null
        );
        approvalRecordRepository.saveAndFlush(record);
        version.setApprovalStatus(CodeApprovalStatus.REVOKED);
        version.setUpdatedAt(Instant.now());
        versionRepository.saveAndFlush(version);
        auditService.revoked(asset.getId(), version.getId());
        return record;
    }

    private void requireCurrentPassingEvidence(CodeVersion version, CodeValidationRun run) {
        if (!"PASSED".equals(run.getStatus())) {
            throw validation("LATEST_VALIDATION_FAILED", "Latest validation did not pass");
        }
        if (!Objects.equals(run.getArtifactSha256(), version.getArtifactSha256())) {
            throw validation("VALIDATION_SHA_MISMATCH", "Validation evidence hash does not match");
        }
        if (!Objects.equals(run.getPolicyVersion(), version.getValidationPolicyVersion())
                || !CodeArtifactAssembler.POLICY_VERSION.equals(run.getPolicyVersion())) {
            throw validation("VALIDATION_POLICY_MISMATCH", "Validation policy is not current");
        }
        if (!"PASSED".equals(version.getValidationStatus())) {
            throw validation("VERSION_VALIDATION_NOT_PASSED", "Code version validation did not pass");
        }
    }

    private static boolean exactApprovedEvidence(
            CodeApprovalRecord latest,
            CodeVersion version,
            CodeValidationRun run
    ) {
        return latest != null
                && CodeApprovalStatus.APPROVED.equals(latest.getDecision())
                && Objects.equals(latest.getValidationRunId(), run.getId())
                && Objects.equals(latest.getArtifactSha256(), version.getArtifactSha256())
                && Objects.equals(latest.getPolicyVersion(), CodeArtifactAssembler.POLICY_VERSION);
    }

    private CodeApprovalRecord newRecord(
            CodeVersion version,
            String decision,
            String reason,
            CodeValidationRun validationRun
    ) {
        CodeApprovalRecord record = new CodeApprovalRecord();
        record.setId("code-approval-" + UUID.randomUUID().toString().replace("-", ""));
        record.setVersionId(version.getId());
        record.setArtifactSha256(
                validationRun == null ? null : version.getArtifactSha256()
        );
        record.setValidationRunId(validationRun == null ? null : validationRun.getId());
        record.setPolicyVersion(
                validationRun == null ? null : CodeArtifactAssembler.POLICY_VERSION
        );
        record.setDecision(decision);
        record.setReason(reason);
        record.setReviewerUserId(authContext.currentUserId());
        record.setCreatedAt(Instant.now());
        return record;
    }

    private static String sanitizeRequiredReason(String reason) {
        if (reason == null) {
            throw validation("APPROVAL_REASON_REQUIRED", "Approval reason is required");
        }
        String sanitized = reason.replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", " ")
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replaceAll("\\s+", " ")
                .trim();
        if (sanitized.isEmpty()) {
            throw validation("APPROVAL_REASON_REQUIRED", "Approval reason is required");
        }
        return sanitized.length() <= 1024 ? sanitized : sanitized.substring(0, 1024);
    }

    private static CodeValidationException validation(String code, String message) {
        return new CodeValidationException(code, message);
    }
}
