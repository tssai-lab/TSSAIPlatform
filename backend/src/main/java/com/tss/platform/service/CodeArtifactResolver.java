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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.regex.Pattern;

@Service
public class CodeArtifactResolver {

    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");

    private final CodeVersionRepository versionRepository;
    private final CodeAssetRepository assetRepository;
    private final CodeValidationRunRepository validationRunRepository;
    private final CodeApprovalRecordRepository approvalRecordRepository;

    public CodeArtifactResolver(
            CodeVersionRepository versionRepository,
            CodeAssetRepository assetRepository,
            CodeValidationRunRepository validationRunRepository,
            CodeApprovalRecordRepository approvalRecordRepository
    ) {
        this.versionRepository = versionRepository;
        this.assetRepository = assetRepository;
        this.validationRunRepository = validationRunRepository;
        this.approvalRecordRepository = approvalRecordRepository;
    }

    @Transactional
    public ResolvedCodeArtifact resolve(String versionId, Integer consumerOwnerId) {
        if (consumerOwnerId == null) {
            throw new CodeAssetAccessException();
        }
        CodeVersion version = versionRepository.findByIdAndDeletedFalseForUpdate(versionId)
                .orElseThrow(CodeAssetAccessException::new);
        CodeAsset asset = assetRepository.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(CodeAssetAccessException::new);
        if (asset.getOwnerUserId() == null
                || !consumerOwnerId.equals(asset.getOwnerUserId())
                || !Objects.equals(asset.getOwnerUserId(), version.getOwnerUserId())
                || !Objects.equals(asset.getId(), version.getAssetId())) {
            throw new CodeAssetAccessException();
        }

        require("READY".equals(version.getStatus()),
                "VERSION_NOT_READY", "Code version is not ready");
        require(version.getArtifactSha256() != null
                        && SHA256.matcher(version.getArtifactSha256()).matches(),
                "ARTIFACT_EVIDENCE_INVALID", "Code artifact evidence is invalid");
        require("PASSED".equals(version.getValidationStatus())
                        && CodeArtifactAssembler.POLICY_VERSION.equals(
                                version.getValidationPolicyVersion()),
                "VALIDATION_NOT_CURRENT", "Code version validation is not current");

        CodeValidationRun validationRun = validationRunRepository
                .findTopByVersionIdOrderByCreatedAtDescIdDesc(version.getId())
                .orElseThrow(() -> validation(
                        "VALIDATION_EVIDENCE_MISSING",
                        "Code version validation evidence is missing"
                ));
        require("PASSED".equals(validationRun.getStatus())
                        && Objects.equals(validationRun.getArtifactSha256(),
                                version.getArtifactSha256())
                        && CodeArtifactAssembler.POLICY_VERSION.equals(
                                validationRun.getPolicyVersion()),
                "VALIDATION_EVIDENCE_STALE", "Code version validation evidence is stale");

        require(CodeApprovalStatus.APPROVED.equals(version.getApprovalStatus()),
                "APPROVAL_REQUIRED", "Code version is not approved");
        CodeApprovalRecord approval = approvalRecordRepository
                .findTopByVersionIdOrderByCreatedAtDescIdDesc(version.getId())
                .orElseThrow(() -> validation(
                        "APPROVAL_EVIDENCE_MISSING",
                        "Code version approval evidence is missing"
                ));
        require(CodeApprovalStatus.APPROVED.equals(approval.getDecision())
                        && Objects.equals(approval.getValidationRunId(), validationRun.getId())
                        && Objects.equals(approval.getArtifactSha256(), version.getArtifactSha256())
                        && CodeArtifactAssembler.POLICY_VERSION.equals(approval.getPolicyVersion()),
                "APPROVAL_EVIDENCE_STALE", "Code version approval evidence is stale");

        String storagePath = version.getStoragePath();
        String prefix = "users/" + consumerOwnerId
                + "/codes/" + asset.getId()
                + "/versions/" + version.getId() + "/";
        String leaf = storagePath != null && storagePath.startsWith(prefix)
                ? storagePath.substring(prefix.length())
                : null;
        require(storagePath != null
                        && storagePath.startsWith(prefix)
                        && leaf != null
                        && !leaf.isBlank()
                        && !leaf.contains("/")
                        && !leaf.contains("\\")
                        && !leaf.contains("?")
                        && !leaf.contains("#")
                        && !".".equals(leaf)
                        && !"..".equals(leaf),
                "STORAGE_REFERENCE_INVALID", "Code artifact storage reference is invalid");

        return new ResolvedCodeArtifact(
                asset.getId(),
                version.getId(),
                version.getPurpose(),
                version.getRuntime(),
                normalizedEntryScript(version),
                version.getTrainingType(),
                version.getTrainingProfile(),
                version.getArtifactSha256(),
                validationRun.getId(),
                validationRun.getPolicyVersion(),
                approval.getId(),
                storagePath
        );
    }

    private static String normalizedEntryScript(CodeVersion version) {
        if (version.getEntryScript() != null && !version.getEntryScript().isBlank()) {
            return version.getEntryScript().trim();
        }
        return null;
    }

    private static void require(boolean condition, String reasonCode, String message) {
        if (!condition) {
            throw validation(reasonCode, message);
        }
    }

    private static CodeValidationException validation(String code, String message) {
        return new CodeValidationException(code, message);
    }
}
