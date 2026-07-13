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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CodeApprovalServiceTest {

    private final CodeVersionRepository versionRepository = mock(CodeVersionRepository.class);
    private final CodeAssetRepository assetRepository = mock(CodeAssetRepository.class);
    private final CodeValidationRunRepository validationRepository =
            mock(CodeValidationRunRepository.class);
    private final CodeApprovalRecordRepository approvalRepository =
            mock(CodeApprovalRecordRepository.class);
    private final CodeAssetAuditService auditService = mock(CodeAssetAuditService.class);
    private final AuthContext authContext = mock(AuthContext.class);

    private CodeApprovalService service;
    private CodeVersion version;
    private CodeValidationRun validation;

    @BeforeEach
    void setUp() {
        service = new CodeApprovalService(
                versionRepository,
                assetRepository,
                validationRepository,
                approvalRepository,
                auditService,
                authContext
        );
        when(authContext.isAdmin()).thenReturn(true);
        when(authContext.currentUserId()).thenReturn(99);
        version = version();
        validation = validation("validation-1");
        when(versionRepository.findAssetIdByIdAndDeletedFalse("version-1"))
                .thenReturn(Optional.of("asset-1"));
        when(versionRepository.findByIdAndDeletedFalseForUpdate("version-1"))
                .thenReturn(Optional.of(version));
        when(assetRepository.findByIdAndDeletedFalseForUpdate("asset-1"))
                .thenReturn(Optional.of(asset()));
        when(validationRepository.findTopByVersionIdOrderByCreatedAtDescIdDesc("version-1"))
                .thenReturn(Optional.of(validation));
        when(approvalRepository.findTopByVersionIdOrderByCreatedAtDescIdDesc("version-1"))
                .thenReturn(Optional.empty());
        when(approvalRepository.saveAndFlush(any(CodeApprovalRecord.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(versionRepository.saveAndFlush(any(CodeVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void checksAdministratorAuthorityBeforeAnyResourceLookup() {
        when(authContext.isAdmin()).thenReturn(false);

        assertThrows(
                CodeApprovalForbiddenException.class,
                () -> service.decide("secret-version", CodeApprovalService.Decision.APPROVE, null)
        );

        verify(versionRepository, never()).findAssetIdByIdAndDeletedFalse(any());
        verify(versionRepository, never()).findByIdAndDeletedFalseForUpdate(any());
        verify(assetRepository, never()).findByIdAndDeletedFalseForUpdate(any());
        verify(validationRepository, never())
                .findTopByVersionIdOrderByCreatedAtDescIdDesc(any());
        verify(approvalRepository, never()).saveAndFlush(any());
    }

    @Test
    void authorityProviderFailureIsGenericAndPerformsNoLookup() {
        when(authContext.isAdmin()).thenThrow(
                new IllegalStateException("token=secret-admin-context")
        );

        CodeApprovalForbiddenException error = assertThrows(
                CodeApprovalForbiddenException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.APPROVE, null)
        );

        assertFalse(error.getMessage().contains("secret-admin-context"));
        assertEquals(null, error.getCause());
        verify(versionRepository, never()).findByIdAndDeletedFalseForUpdate(any());
    }

    @Test
    void hidesMissingAndCrossResourceAfterAdministratorCheck() {
        when(versionRepository.findAssetIdByIdAndDeletedFalse("missing"))
                .thenReturn(Optional.empty());
        assertThrows(CodeAssetAccessException.class,
                () -> service.decide("missing", CodeApprovalService.Decision.APPROVE, null));

        CodeAsset cross = asset();
        cross.setOwnerUserId(8);
        when(assetRepository.findByIdAndDeletedFalseForUpdate("asset-1"))
                .thenReturn(Optional.of(cross));
        assertThrows(CodeAssetAccessException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.APPROVE, null));
        verify(approvalRepository, never()).saveAndFlush(any());
    }

    @Test
    void approvesOnlyLatestExactPassingEvidenceAndPersistsFullBinding() {
        CodeApprovalRecord approved = service.decide(
                "version-1", CodeApprovalService.Decision.APPROVE, "ignored"
        );

        assertEquals(CodeApprovalStatus.APPROVED, version.getApprovalStatus());
        assertEquals(CodeApprovalStatus.APPROVED, approved.getDecision());
        assertEquals(version.getArtifactSha256(), approved.getArtifactSha256());
        assertEquals(validation.getId(), approved.getValidationRunId());
        assertEquals(CodeArtifactAssembler.POLICY_VERSION, approved.getPolicyVersion());
        assertEquals(99, approved.getReviewerUserId());
        assertNotNull(approved.getCreatedAt());
        verify(versionRepository).saveAndFlush(version);
        verify(auditService).approved(
                "asset-1", "version-1", "a".repeat(64),
                CodeArtifactAssembler.POLICY_VERSION
        );
    }

    @Test
    void approvalWriterLocksAssetBeforeVersionAfterScalarLocation() {
        service.decide("version-1", CodeApprovalService.Decision.REJECT, "not approved");

        var order = inOrder(versionRepository, assetRepository);
        order.verify(versionRepository).findAssetIdByIdAndDeletedFalse("version-1");
        order.verify(assetRepository).findByIdAndDeletedFalseForUpdate("asset-1");
        order.verify(versionRepository).findByIdAndDeletedFalseForUpdate("version-1");
    }

    @Test
    void deniesNonReadyFailedShaPolicyAndVersionStateMismatch() {
        version.setStatus("DEPRECATED");
        assertReason("VERSION_NOT_READY");

        version.setStatus("READY");
        validation.setStatus("FAILED");
        assertReason("LATEST_VALIDATION_FAILED");

        validation.setStatus("PASSED");
        validation.setArtifactSha256("b".repeat(64));
        assertReason("VALIDATION_SHA_MISMATCH");

        validation.setArtifactSha256(version.getArtifactSha256());
        validation.setPolicyVersion("OLD_POLICY");
        assertReason("VALIDATION_POLICY_MISMATCH");

        validation.setPolicyVersion(CodeArtifactAssembler.POLICY_VERSION);
        version.setValidationStatus("FAILED");
        assertReason("VERSION_VALIDATION_NOT_PASSED");
        verify(approvalRepository, never()).saveAndFlush(any());
    }

    @Test
    void exactApprovedEvidenceIsIdempotentWithoutDuplicateRows() {
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);
        CodeApprovalRecord existing = approvedRecord("approval-1", validation.getId());
        when(approvalRepository.findTopByVersionIdOrderByCreatedAtDescIdDesc("version-1"))
                .thenReturn(Optional.of(existing));

        CodeApprovalRecord result = service.decide(
                "version-1", CodeApprovalService.Decision.APPROVE, null
        );

        assertSame(existing, result);
        verify(approvalRepository, never()).saveAndFlush(any());
        verify(versionRepository, never()).saveAndFlush(any());
        verify(auditService, never()).approved(any(), any(), any(), any());
    }

    @Test
    void staleApprovedEvidenceRefreshesAgainstLatestSuccessfulRun() {
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);
        CodeApprovalRecord stale = approvedRecord("approval-old", "validation-old");
        when(approvalRepository.findTopByVersionIdOrderByCreatedAtDescIdDesc("version-1"))
                .thenReturn(Optional.of(stale));

        CodeApprovalRecord refreshed = service.decide(
                "version-1", CodeApprovalService.Decision.APPROVE, null
        );

        assertEquals(validation.getId(), refreshed.getValidationRunId());
        assertTrue(!stale.getId().equals(refreshed.getId()));
        verify(approvalRepository).saveAndFlush(refreshed);
    }

    @Test
    void latestRevokedEvidenceIsTerminalEvenIfVersionRowIsStaleApproved() {
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);
        CodeApprovalRecord revoked = approvedRecord("approval-revoked", validation.getId());
        revoked.setDecision(CodeApprovalStatus.REVOKED);
        when(approvalRepository.findTopByVersionIdOrderByCreatedAtDescIdDesc("version-1"))
                .thenReturn(Optional.of(revoked));

        CodeValidationException error = assertThrows(
                CodeValidationException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.APPROVE, null)
        );

        assertEquals("APPROVAL_TERMINAL", error.getReasonCode());
        verify(approvalRepository, never()).saveAndFlush(any());
    }

    @Test
    void rejectSanitizesReasonAndIsTerminal() {
        CodeApprovalRecord rejected = service.decide(
                "version-1", CodeApprovalService.Decision.REJECT,
                "  unsafe\r\n\t reason\u0000  "
        );

        assertEquals(CodeApprovalStatus.REJECTED, version.getApprovalStatus());
        assertEquals("unsafe reason", rejected.getReason());
        assertEquals(null, rejected.getArtifactSha256());
        assertEquals(null, rejected.getValidationRunId());
        verify(auditService).rejected("asset-1", "version-1");

        assertReason("APPROVAL_TERMINAL");
        assertThrows(CodeValidationException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.REVOKE, "x"));
    }

    @Test
    void revokeWorksWithoutReadingPotentiallyFailedValidation() {
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);

        CodeApprovalRecord revoked = service.decide(
                "version-1", CodeApprovalService.Decision.REVOKE, " emergency revoke "
        );

        assertEquals(CodeApprovalStatus.REVOKED, version.getApprovalStatus());
        assertEquals(CodeApprovalStatus.REVOKED, revoked.getDecision());
        assertEquals("emergency revoke", revoked.getReason());
        verify(validationRepository, never())
                .findTopByVersionIdOrderByCreatedAtDescIdDesc(any());
        verify(auditService).revoked("asset-1", "version-1");
    }

    @Test
    void rejectAndRevokeRequireNonblankReason() {
        assertThrows(CodeValidationException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.REJECT, "\n\t"));
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);
        assertThrows(CodeValidationException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.REVOKE, null));
        verify(approvalRepository, never()).saveAndFlush(any());
    }

    private void assertReason(String reasonCode) {
        CodeValidationException error = assertThrows(
                CodeValidationException.class,
                () -> service.decide("version-1", CodeApprovalService.Decision.APPROVE, null)
        );
        assertEquals(reasonCode, error.getReasonCode());
    }

    private static CodeAsset asset() {
        CodeAsset asset = new CodeAsset();
        asset.setId("asset-1");
        asset.setOwnerUserId(7);
        asset.setDeleted(false);
        return asset;
    }

    private static CodeVersion version() {
        CodeVersion version = new CodeVersion();
        version.setId("version-1");
        version.setAssetId("asset-1");
        version.setOwnerUserId(7);
        version.setStatus("READY");
        version.setApprovalStatus(CodeApprovalStatus.PENDING);
        version.setArtifactSha256("a".repeat(64));
        version.setValidationStatus("PASSED");
        version.setValidationPolicyVersion(CodeArtifactAssembler.POLICY_VERSION);
        version.setDeleted(false);
        return version;
    }

    private static CodeValidationRun validation(String id) {
        CodeValidationRun run = new CodeValidationRun();
        run.setId(id);
        run.setVersionId("version-1");
        run.setArtifactSha256("a".repeat(64));
        run.setPolicyVersion(CodeArtifactAssembler.POLICY_VERSION);
        run.setStatus("PASSED");
        run.setCreatedAt(Instant.now());
        return run;
    }

    private static CodeApprovalRecord approvedRecord(String id, String validationRunId) {
        CodeApprovalRecord record = new CodeApprovalRecord();
        record.setId(id);
        record.setVersionId("version-1");
        record.setDecision(CodeApprovalStatus.APPROVED);
        record.setArtifactSha256("a".repeat(64));
        record.setValidationRunId(validationRunId);
        record.setPolicyVersion(CodeArtifactAssembler.POLICY_VERSION);
        record.setCreatedAt(Instant.now());
        return record;
    }
}
