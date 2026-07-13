package com.tss.platform.service;

import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeValidationRun;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.entity.CodeWorkspace;
import com.tss.platform.entity.CodeWorkspaceFileDelta;
import com.tss.platform.model.CodeApprovalStatus;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeValidationRunRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.repository.CodeWorkspaceFileDeltaRepository;
import com.tss.platform.repository.CodeWorkspaceRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CodeValidationServiceTest {

    private final CodeWorkspaceRepository workspaceRepository = mock(CodeWorkspaceRepository.class);
    private final CodeWorkspaceFileDeltaRepository deltaRepository =
            mock(CodeWorkspaceFileDeltaRepository.class);
    private final CodeAssetRepository assetRepository = mock(CodeAssetRepository.class);
    private final CodeVersionRepository versionRepository = mock(CodeVersionRepository.class);
    private final CodeValidationRunRepository validationRepository =
            mock(CodeValidationRunRepository.class);
    private final CodeArtifactStorageService storageService =
            mock(CodeArtifactStorageService.class);
    private final CodeAssetAuditService auditService = mock(CodeAssetAuditService.class);
    private final AuthContext authContext = mock(AuthContext.class);
    private final PlatformTransactionManager transactionManager =
            mock(PlatformTransactionManager.class);
    private final TransactionStatus transactionStatus = mock(TransactionStatus.class);
    private final CodeFilePolicy filePolicy = new CodeFilePolicy();
    private final CodeZipArchiveService zipService = new CodeZipArchiveService();
    private final CodeArtifactAssembler assembler = new CodeArtifactAssembler(
            storageService, zipService, new CodePathPolicy(), filePolicy
    );

    private CodeValidationService service;
    private CodeAsset asset;
    private CodeVersion version;
    private byte[] validArchive;

    @BeforeEach
    void setUp() {
        when(transactionManager.getTransaction(any(TransactionDefinition.class)))
                .thenReturn(transactionStatus);
        when(authContext.canAccessOwner(7)).thenReturn(true);
        when(authContext.canAccessObjectName(
                "users/7/codes/asset-1/versions/version-1/artifact.zip", 7
        )).thenReturn(true);
        when(authContext.currentUserId()).thenReturn(7);
        service = new CodeValidationService(
                workspaceRepository,
                deltaRepository,
                assetRepository,
                versionRepository,
                validationRepository,
                storageService,
                assembler,
                auditService,
                authContext,
                transactionManager
        );
        asset = asset();
        validArchive = zipService.writeDeterministic(Map.of(
                "train.py", bytes("print('ok')\n")
        ));
        version = version(filePolicy.sha256(validArchive));
        stubVersionSnapshot(version, asset);
        when(storageService.read(version.getStoragePath())).thenReturn(stored(validArchive));
        when(validationRepository.saveAndFlush(any(CodeValidationRun.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(versionRepository.saveAndFlush(any(CodeVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void workspaceValidationUsesAssetThenWorkspaceLocksAndPersistsNothing() {
        CodeWorkspace workspace = workspace(4L);
        stubWorkspace(workspace);
        when(deltaRepository.findByWorkspaceIdOrderByPathAsc("workspace-1"))
                .thenReturn(List.of(upsert("train.py", "print('ok')\n")));

        CodeValidationResult result = service.validateWorkspace("workspace-1", 4L);

        assertTrue(result.passed());
        assertEquals(CodeArtifactAssembler.POLICY_VERSION, result.policyVersion());
        assertEquals(1, result.fileCount());
        assertTrue(result.artifactSha256().matches("[0-9a-f]{64}"));
        verify(validationRepository, never()).saveAndFlush(any());
        verify(versionRepository, never()).saveAndFlush(any());
        verify(auditService).workspaceValidated(
                "asset-1", "workspace-1", 4L, result.artifactSha256(),
                CodeArtifactAssembler.POLICY_VERSION, "VALIDATION_PASSED", 1L
        );
        ArgumentCaptor<TransactionDefinition> transactionCaptor =
                ArgumentCaptor.forClass(TransactionDefinition.class);
        verify(transactionManager, times(2)).getTransaction(transactionCaptor.capture());
        assertTrue(transactionCaptor.getAllValues().stream().allMatch(definition ->
                definition.getPropagationBehavior()
                        == TransactionDefinition.PROPAGATION_REQUIRES_NEW));
        var order = inOrder(workspaceRepository, assetRepository);
        order.verify(workspaceRepository).findAssetIdByIdAndDeletedFalse("workspace-1");
        order.verify(assetRepository).findByIdAndDeletedFalseForUpdate("asset-1");
        order.verify(workspaceRepository).findByIdAndDeletedFalseForUpdate("workspace-1");
    }

    @Test
    void workspaceMissingEntryReturnsActualMaterializedHashWithoutPersisting() {
        CodeWorkspace workspace = workspace(0L);
        stubWorkspace(workspace);
        CodeWorkspaceFileDelta notes = upsert("notes.txt", "hello\n");
        when(deltaRepository.findByWorkspaceIdOrderByPathAsc("workspace-1"))
                .thenReturn(List.of(notes));
        byte[] expectedArchive = zipService.writeDeterministic(Map.of(
                "notes.txt", bytes("hello\n")
        ));

        CodeValidationResult result = service.validateWorkspace("workspace-1", 0L);

        assertFalse(result.passed());
        assertEquals("ENTRY_SCRIPT_MISSING", result.reasonCode());
        assertEquals(filePolicy.sha256(expectedArchive), result.artifactSha256());
        assertNotEquals("0".repeat(64), result.artifactSha256());
        verify(validationRepository, never()).saveAndFlush(any());
    }

    @Test
    void workspaceOwnerStatusAndRevisionGatesHappenBeforeMaterialization() {
        CodeWorkspace workspace = workspace(2L);
        stubWorkspace(workspace);
        when(authContext.canAccessOwner(7)).thenReturn(false);
        assertThrows(CodeAssetAccessException.class,
                () -> service.validateWorkspace("workspace-1", 2L));
        verify(deltaRepository, never()).findByWorkspaceIdOrderByPathAsc(any());

        when(authContext.canAccessOwner(7)).thenReturn(true);
        workspace.setStatus(CodeWorkspace.STATUS_ABANDONED);
        assertConflict("WORKSPACE_READ_ONLY", 2L);

        workspace.setStatus(CodeWorkspace.STATUS_OPEN);
        assertConflict("WORKSPACE_REVISION_CONFLICT", 1L);
    }

    @Test
    void versionSuccessPersistsLatestRunAndUpdatesPolicyWithoutApprovalSideEffect() {
        version.setApprovalStatus(CodeApprovalStatus.APPROVED);

        CodeValidationResult result = service.validateVersion("version-1");

        assertTrue(result.passed());
        assertEquals(CodeApprovalStatus.APPROVED, version.getApprovalStatus());
        assertEquals("PASSED", version.getValidationStatus());
        assertEquals(CodeArtifactAssembler.POLICY_VERSION, version.getValidationPolicyVersion());
        ArgumentCaptor<CodeValidationRun> runCaptor =
                ArgumentCaptor.forClass(CodeValidationRun.class);
        verify(validationRepository).saveAndFlush(runCaptor.capture());
        CodeValidationRun run = runCaptor.getValue();
        assertEquals(version.getArtifactSha256(), run.getArtifactSha256());
        assertEquals("PASSED", run.getStatus());
        assertEquals(7, run.getRequestedByUserId());
        verify(auditService).validated(
                "asset-1", "version-1", version.getArtifactSha256(),
                CodeArtifactAssembler.POLICY_VERSION, "VALIDATION_PASSED", 1L
        );
        ArgumentCaptor<TransactionDefinition> transactionCaptor =
                ArgumentCaptor.forClass(TransactionDefinition.class);
        verify(transactionManager, times(2)).getTransaction(transactionCaptor.capture());
        assertTrue(transactionCaptor.getAllValues().stream().allMatch(definition ->
                definition.getPropagationBehavior()
                        == TransactionDefinition.PROPAGATION_REQUIRES_NEW));
        var lockOrder = inOrder(versionRepository, assetRepository);
        lockOrder.verify(versionRepository).findByIdAndDeletedFalse("version-1");
        lockOrder.verify(assetRepository).findByIdAndDeletedFalse("asset-1");
        lockOrder.verify(assetRepository).findByIdAndDeletedFalseForUpdate("asset-1");
        lockOrder.verify(versionRepository).findByIdAndDeletedFalseForUpdate("version-1");
    }

    @Test
    void assetMetadataChangesDoNotChangeOldVersionRevalidationEntryGate() {
        asset.setEntryScript("mutated.py");
        asset.setPurpose("MUTATED");

        CodeValidationResult result = service.validateVersion("version-1");

        assertTrue(result.passed());
        assertEquals("train.py", version.getEntryScript());
        assertEquals("TRAINING", version.getPurpose());
    }

    @Test
    void hashMismatchRecordsObservedHashAndNeverOverwritesExpectedArtifactHash() {
        String expected = "b".repeat(64);
        version.setArtifactSha256(expected);

        CodeValidationResult result = service.validateVersion("version-1");

        assertFalse(result.passed());
        assertEquals("ARTIFACT_SHA256_MISMATCH", result.reasonCode());
        assertEquals(filePolicy.sha256(validArchive), result.artifactSha256());
        assertEquals(expected, version.getArtifactSha256());
        ArgumentCaptor<CodeValidationRun> captor = ArgumentCaptor.forClass(CodeValidationRun.class);
        verify(validationRepository).saveAndFlush(captor.capture());
        assertEquals(result.artifactSha256(), captor.getValue().getArtifactSha256());
        assertEquals("FAILED", version.getValidationStatus());
    }

    @Test
    void invalidArchivePersistsSafeFailureWithoutRawZipMessage() {
        byte[] invalid = bytes("not-a-zip users/7/private?token=secret");
        version.setArtifactSha256(filePolicy.sha256(invalid));
        when(storageService.read(version.getStoragePath())).thenReturn(stored(invalid));

        CodeValidationResult result = service.validateVersion("version-1");

        assertFalse(result.passed());
        assertEquals("Code artifact validation failed", result.safeMessage());
        assertFalse(result.safeMessage().contains("users/7"));
        ArgumentCaptor<CodeValidationRun> captor = ArgumentCaptor.forClass(CodeValidationRun.class);
        verify(validationRepository).saveAndFlush(captor.capture());
        assertEquals(result.safeMessage(), captor.getValue().getFailureMessage());
        assertFalse(captor.getValue().getFailureMessage().contains("token="));
    }

    @Test
    void storageFailureUsesExpectedHashAndCannotPassApprovalGate() {
        when(storageService.read(version.getStoragePath()))
                .thenThrow(new CodeArtifactStorageException());

        CodeValidationResult result = service.validateVersion("version-1");

        assertFalse(result.passed());
        assertEquals("STORAGE_READ_FAILED", result.reasonCode());
        assertEquals(version.getArtifactSha256(), result.artifactSha256());
        assertEquals("FAILED", version.getValidationStatus());
        ArgumentCaptor<CodeValidationRun> captor = ArgumentCaptor.forClass(CodeValidationRun.class);
        verify(validationRepository).saveAndFlush(captor.capture());
        assertEquals("FAILED", captor.getValue().getStatus());
    }

    @Test
    void concurrentStorageOrHashChangeBeforeFinalLockRejectsWithoutRun() {
        CodeVersion changed = version(filePolicy.sha256(validArchive));
        changed.setStoragePath("users/7/codes/asset-1/versions/version-1/replaced.zip");
        when(versionRepository.findByIdAndDeletedFalseForUpdate("version-1"))
                .thenReturn(Optional.of(changed));

        CodeWorkspaceConflictException error = assertThrows(
                CodeWorkspaceConflictException.class,
                () -> service.validateVersion("version-1")
        );

        assertEquals("VERSION_CHANGED", error.getReasonCode());
        verify(validationRepository, never()).saveAndFlush(any());
    }

    @Test
    void missingCrossOwnerAndInvalidExpectedHashAreHiddenOrStable() {
        when(versionRepository.findByIdAndDeletedFalse("missing")).thenReturn(Optional.empty());
        assertThrows(CodeAssetAccessException.class, () -> service.validateVersion("missing"));

        when(authContext.canAccessOwner(7)).thenReturn(false);
        assertThrows(CodeAssetAccessException.class, () -> service.validateVersion("version-1"));

        when(authContext.canAccessOwner(7)).thenReturn(true);
        version.setArtifactSha256(" ");
        CodeValidationException invalid = assertThrows(
                CodeValidationException.class,
                () -> service.validateVersion("version-1")
        );
        assertEquals("VERSION_EVIDENCE_MISSING", invalid.getReasonCode());
        verify(storageService, never()).read(" ");
    }

    private void stubWorkspace(CodeWorkspace workspace) {
        when(workspaceRepository.findAssetIdByIdAndDeletedFalse("workspace-1"))
                .thenReturn(Optional.of("asset-1"));
        when(assetRepository.findByIdAndDeletedFalseForUpdate("asset-1"))
                .thenReturn(Optional.of(asset));
        when(workspaceRepository.findByIdAndDeletedFalseForUpdate("workspace-1"))
                .thenReturn(Optional.of(workspace));
    }

    private void stubVersionSnapshot(CodeVersion value, CodeAsset ownerAsset) {
        when(versionRepository.findByIdAndDeletedFalse("version-1"))
                .thenReturn(Optional.of(value));
        when(versionRepository.findByIdAndDeletedFalseForUpdate("version-1"))
                .thenReturn(Optional.of(value));
        when(assetRepository.findByIdAndDeletedFalse("asset-1"))
                .thenReturn(Optional.of(ownerAsset));
        when(assetRepository.findByIdAndDeletedFalseForUpdate("asset-1"))
                .thenReturn(Optional.of(ownerAsset));
    }

    private void assertConflict(String code, long revision) {
        CodeWorkspaceConflictException error = assertThrows(
                CodeWorkspaceConflictException.class,
                () -> service.validateWorkspace("workspace-1", revision)
        );
        assertEquals(code, error.getReasonCode());
    }

    private StoredCodeArtifact stored(byte[] bytes) {
        return new StoredCodeArtifact(
                version == null
                        ? "users/7/codes/asset-1/versions/version-1/artifact.zip"
                        : version.getStoragePath(),
                bytes,
                filePolicy.sha256(bytes),
                bytes.length
        );
    }

    private static CodeAsset asset() {
        CodeAsset asset = new CodeAsset();
        asset.setId("asset-1");
        asset.setName("asset");
        asset.setOwnerUserId(7);
        asset.setEntryScript("train.py");
        asset.setPurpose("TRAINING");
        asset.setRuntime("python:3.11");
        asset.setTrainingType("NLP");
        asset.setTrainingProfile("profile-1");
        asset.setDeleted(false);
        return asset;
    }

    private static CodeVersion version(String sha) {
        CodeVersion version = new CodeVersion();
        version.setId("version-1");
        version.setAssetId("asset-1");
        version.setOwnerUserId(7);
        version.setStatus("READY");
        version.setApprovalStatus(CodeApprovalStatus.PENDING);
        version.setArtifactSha256(sha);
        version.setValidationStatus("PASSED");
        version.setValidationPolicyVersion("OLD_POLICY");
        version.setStoragePath("users/7/codes/asset-1/versions/version-1/artifact.zip");
        version.setPurpose("TRAINING");
        version.setRuntime("python:3.11");
        version.setEntryScript("train.py");
        version.setTrainingType("NLP");
        version.setTrainingProfile("profile-1");
        version.setDeleted(false);
        return version;
    }

    private static CodeWorkspace workspace(long revision) {
        CodeWorkspace workspace = new CodeWorkspace();
        workspace.setId("workspace-1");
        workspace.setAssetId("asset-1");
        workspace.setOwnerUserId(7);
        workspace.setStatus(CodeWorkspace.STATUS_OPEN);
        workspace.setRevision(revision);
        workspace.setCreatedAt(Instant.now());
        workspace.setUpdatedAt(Instant.now());
        workspace.setDeleted(false);
        return workspace;
    }

    private CodeWorkspaceFileDelta upsert(String path, String text) {
        byte[] content = bytes(text);
        CodeWorkspaceFileDelta delta = new CodeWorkspaceFileDelta();
        delta.setId("delta-" + path.replace('/', '-'));
        delta.setWorkspaceId("workspace-1");
        delta.setPath(path);
        delta.setOperation(CodeWorkspaceFileDelta.OPERATION_UPSERT);
        delta.setContentBytes(content);
        delta.setContentHash(filePolicy.sha256(content));
        delta.setSizeBytes((long) content.length);
        delta.setCreatedAt(Instant.now());
        delta.setUpdatedAt(Instant.now());
        return delta;
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
