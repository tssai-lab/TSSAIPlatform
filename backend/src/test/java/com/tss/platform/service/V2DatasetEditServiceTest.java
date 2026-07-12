package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.DatasetPackageCleanupPlanDto;
import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.DatasetWorkspaceDraftDto;
import com.tss.platform.dto.DatasetWorkspacePublishDto;
import com.tss.platform.dto.v2.V2DatasetDiscardResult;
import com.tss.platform.dto.v2.V2DatasetEditSessionDto;
import com.tss.platform.dto.v2.V2DatasetPublishResult;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetPackage;
import com.tss.platform.entity.DatasetUploadChunk;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.DatasetVersionPackage;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetPackageRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadChunkRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionPackageRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class V2DatasetEditServiceTest {

    @Test
    void returnsExistingDraftAsIdempotentEditSession() {
        Fixture fixture = new Fixture();
        fixture.stubOwnedAsset();
        when(fixture.versionRepo
                .findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                        fixture.asset.getId(),
                        "DRAFT"
                ))
                .thenReturn(Optional.of(fixture.draft));
        fixture.stubEditSessionState();

        V2DatasetEditSessionDto result =
                fixture.service.createEditSession(fixture.asset.getId());

        assertEquals(fixture.draft.getId(), result.getEditSessionId());
        verify(fixture.workspaceService, never()).createDraft(any());
    }

    @Test
    void createsDraftFromCurrentReadyWhenNoActiveDraftExists() {
        Fixture fixture = new Fixture();
        fixture.stubOwnedAsset();
        when(fixture.versionRepo
                .findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                        fixture.asset.getId(),
                        "DRAFT"
                ))
                .thenReturn(Optional.empty());
        DatasetWorkspaceDraftDto created = new DatasetWorkspaceDraftDto();
        created.setDraftVersionId(fixture.draft.getId());
        when(fixture.workspaceService.createDraft(fixture.asset.getCurrentVersionId()))
                .thenReturn(created);
        fixture.stubEditSessionState();

        V2DatasetEditSessionDto result =
                fixture.service.createEditSession(fixture.asset.getId());

        assertEquals(fixture.draft.getId(), result.getEditSessionId());
        verify(fixture.workspaceService).createDraft(fixture.asset.getCurrentVersionId());
    }

    @Test
    void doesNotMisreportDraftCreationFailureAsActiveDraftConflict() {
        Fixture fixture = new Fixture();
        fixture.stubOwnedAsset();
        when(fixture.versionRepo
                .findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                        fixture.asset.getId(),
                        "DRAFT"
                ))
                .thenReturn(Optional.empty());
        when(fixture.workspaceService.createDraft(fixture.asset.getCurrentVersionId()))
                .thenThrow(new IllegalArgumentException(
                        "dataset version not found or no permission"
                ));

        com.tss.platform.controller.v2.V2BusinessException error = assertThrows(
                com.tss.platform.controller.v2.V2BusinessException.class,
                () -> fixture.service.createEditSession(fixture.asset.getId())
        );

        assertEquals("DATASET_NOT_EDITABLE", error.getErrorCode());
    }

    @Test
    void aggregatesLatestUploadImportProgressAndSampleCount() throws Exception {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetUploadSession upload = fixture.uploadSession();
        ImportJob job = fixture.importJob("RUNNING", 35);
        when(fixture.uploadSessionRepo
                .findFirstByVersionIdAndUploadPurposeOrderByCreatedAtDesc(
                        fixture.draft.getId(),
                        "APPEND_PACKAGE"
                ))
                .thenReturn(Optional.of(upload));
        when(fixture.importJobRepo.findByDatasetVersionId(fixture.draft.getId()))
                .thenReturn(List.of(job));
        when(fixture.sampleRepo.countByDatasetVersionIdAndDeletedFalse(fixture.draft.getId()))
                .thenReturn(12L);

        V2DatasetEditSessionDto result =
                fixture.service.getEditSession(fixture.draft.getId());

        assertEquals(12, result.getSampleCount());
        assertEquals(35, result.getImportProgress());
        assertEquals("job-1", result.getImportJobId());
        assertEquals("IMPORTING", result.getDisplayStatus());
        assertFalse(result.getCanPublish());
        assertEquals(upload.getId(), result.getLatestUpload().getUploadId());
        assertFalse(
                new ObjectMapper()
                        .writeValueAsString(result.getLatestUpload())
                        .contains("storagePath")
        );
    }

    @Test
    void exposesAddDataActionForSingleModalEditSession() {
        Fixture fixture = new Fixture();
        fixture.asset.setType("CV");
        fixture.stubEditSessionState();

        V2DatasetEditSessionDto result =
                fixture.service.getEditSession(fixture.draft.getId());

        assertTrue(result.getAvailableActions().contains("ADD_DATA"));
    }

    @Test
    void initializesAppendUploadThroughSharedV2UploadFacade() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetPackageAppendInitRequest request = new DatasetPackageAppendInitRequest();
        request.setFileName("append.zip");
        request.setFileSize(128L);
        V2DatasetUploadDto upload = new V2DatasetUploadDto();
        upload.setUploadId("upload-1");
        when(fixture.uploadService.initAppend(fixture.draft.getId(), request))
                .thenReturn(upload);

        V2DatasetUploadDto result =
                fixture.service.initUpload(fixture.draft.getId(), request);

        assertEquals("upload-1", result.getUploadId());
        verify(fixture.uploadService).initAppend(fixture.draft.getId(), request);
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void discardsDraftAndClosesRelatedUploadImportAndPackageState(CapturedOutput output) {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetUploadSession upload = fixture.uploadSession();
        upload.setStatus("UPLOADING");
        upload.setOwnerUserId(fixture.asset.getOwnerUserId());
        DatasetUploadChunk chunk = new DatasetUploadChunk();
        chunk.setId("chunk-1");
        chunk.setUploadId(upload.getId());
        chunk.setObjectName("tmp/uploads/upload-1/0.part");
        ImportJob importJob = fixture.importJob("RUNNING", 45);
        importJob.setPackageId("package-append");
        DatasetVersionPackage primary =
                fixture.relation("package-primary", "PRIMARY", 0);
        DatasetVersionPackage append =
                fixture.relation("package-append", "APPEND", 1);
        DatasetPackageCleanupPlanDto primaryPlan = new DatasetPackageCleanupPlanDto();
        primaryPlan.setPackageId("package-primary");
        primaryPlan.setCanDelete(false);
        DatasetPackageCleanupPlanDto appendPlan = new DatasetPackageCleanupPlanDto();
        appendPlan.setPackageId("package-append");
        appendPlan.setCanDelete(true);
        appendPlan.setEnqueued(true);
        appendPlan.setStoragePath("users/7/datasets/asset-1/append.zip");
        DatasetPackage appendPackage = fixture.datasetPackage("package-append");

        when(fixture.uploadSessionRepo.findByVersionIdForUpdate(fixture.draft.getId()))
                .thenReturn(List.of(upload));
        when(fixture.uploadChunkRepo.findByUploadIdOrderByPartIndexAsc(upload.getId()))
                .thenReturn(List.of(chunk));
        when(fixture.importJobRepo.findByDatasetVersionId(fixture.draft.getId()))
                .thenReturn(List.of(importJob));
        when(fixture.versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(
                fixture.draft.getId()
        )).thenReturn(List.of(primary, append));
        when(fixture.cleanupPlanner.enqueueIfSafe("package-primary"))
                .thenReturn(primaryPlan);
        when(fixture.cleanupPlanner.enqueueIfSafe("package-append"))
                .thenReturn(appendPlan);
        when(fixture.packageRepo.findByIdAndDeletedFalse("package-append"))
                .thenReturn(Optional.of(appendPackage));

        V2DatasetDiscardResult result = fixture.service.discard(fixture.draft.getId());

        assertEquals(fixture.draft.getId(), result.getEditSessionId());
        assertEquals(fixture.asset.getId(), result.getDatasetId());
        assertEquals("DISCARDED", result.getStatus());
        assertTrue(Boolean.TRUE.equals(fixture.draft.getDeleted()));
        assertEquals("DISCARDED", upload.getStatus());
        assertEquals("SUPERSEDED", importJob.getStatus());
        assertEquals("DRAFT_DISCARDED", importJob.getErrorCode());
        String logs = output.getOut() + output.getErr();
        assertTrue(logs.contains("V2 dataset discard completed"));
        assertTrue(logs.contains("datasetId=" + fixture.asset.getId()));
        assertTrue(logs.contains("versionId=" + fixture.draft.getId()));
        assertTrue(logs.contains("uploadSessionCount=1"));
        assertTrue(logs.contains("importJobCount=1"));
        assertTrue(logs.contains("packageCount=2"));
        assertTrue(logs.contains("chunkCleanupCount=1"));
        assertFalse(logs.contains(chunk.getObjectName()));
        verify(fixture.versionPackageRepo).deleteAll(List.of(primary, append));
        verify(fixture.cleanupPlanner).enqueueIfSafe("package-primary");
        verify(fixture.cleanupPlanner).enqueueIfSafe("package-append");
        verify(fixture.packageRepo, never()).findByIdAndDeletedFalse("package-primary");
        assertTrue(Boolean.TRUE.equals(appendPackage.getDeleted()));
        assertEquals("SUPERSEDED", appendPackage.getStatus());
        verify(fixture.deleteTaskService).enqueueDefaultBucketDeleteImmediately(
                eq(chunk.getObjectName()),
                eq(MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_CHUNK),
                eq(upload.getId()),
                eq(fixture.asset.getOwnerUserId())
        );
        verify(fixture.uploadChunkRepo).deleteByIdImmediately(chunk.getId());
        verify(fixture.uploadChunkRepo, never()).deleteByUploadId(upload.getId());
    }

    @Test
    void discardPropagatesPackageCleanupFailureAndStopsLaterCleanup() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetUploadSession upload = fixture.uploadSession();
        upload.setOwnerUserId(fixture.asset.getOwnerUserId());
        DatasetUploadChunk chunk = new DatasetUploadChunk();
        chunk.setId("chunk-1");
        chunk.setUploadId(upload.getId());
        chunk.setObjectName("tmp/uploads/upload-1/0.part");
        DatasetVersionPackage broken = fixture.relation("package-broken", "APPEND", 1);
        DatasetVersionPackage later = fixture.relation("package-later", "APPEND", 2);
        IllegalArgumentException failure = new IllegalArgumentException("cleanup failed");

        when(fixture.uploadSessionRepo.findByVersionIdForUpdate(fixture.draft.getId()))
                .thenReturn(List.of(upload));
        when(fixture.uploadChunkRepo.findByUploadIdOrderByPartIndexAsc(upload.getId()))
                .thenReturn(List.of(chunk));
        when(fixture.versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(
                fixture.draft.getId()
        )).thenReturn(List.of(broken, later));
        when(fixture.cleanupPlanner.enqueueIfSafe("package-broken"))
                .thenThrow(failure);

        IllegalArgumentException thrown = assertThrows(
                IllegalArgumentException.class,
                () -> fixture.service.discard(fixture.draft.getId())
        );

        assertSame(failure, thrown);
        verify(fixture.cleanupPlanner, never()).enqueueIfSafe("package-later");
        verify(fixture.deleteTaskService, never())
                .enqueueDefaultBucketDeleteImmediately(any(), any(), any(), any());
        verify(fixture.uploadChunkRepo, never()).deleteByIdImmediately(anyString());
        verify(fixture.uploadChunkRepo, never()).deleteByUploadId(anyString());
    }

    @Test
    void discardDeletesOnlyChunkRowsWhoseCleanupWasEnqueued() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetUploadSession upload = fixture.uploadSession();
        upload.setOwnerUserId(fixture.asset.getOwnerUserId());
        DatasetUploadChunk failedCleanup = new DatasetUploadChunk();
        failedCleanup.setId("chunk-failed");
        failedCleanup.setUploadId(upload.getId());
        failedCleanup.setObjectName("tmp/uploads/upload-1/failed.part");
        DatasetUploadChunk successfulCleanup = new DatasetUploadChunk();
        successfulCleanup.setId("chunk-success");
        successfulCleanup.setUploadId(upload.getId());
        successfulCleanup.setObjectName("tmp/uploads/upload-1/success.part");

        when(fixture.uploadSessionRepo.findByVersionIdForUpdate(fixture.draft.getId()))
                .thenReturn(List.of(upload));
        when(fixture.uploadChunkRepo.findByUploadIdOrderByPartIndexAsc(upload.getId()))
                .thenReturn(List.of(failedCleanup, successfulCleanup));
        when(fixture.deleteTaskService.enqueueDefaultBucketDeleteImmediately(
                failedCleanup.getObjectName(),
                MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_CHUNK,
                upload.getId(),
                fixture.asset.getOwnerUserId()
        )).thenThrow(new RuntimeException("queue unavailable"));

        fixture.service.discard(fixture.draft.getId());

        verify(fixture.uploadChunkRepo, never())
                .deleteByIdImmediately(failedCleanup.getId());
        verify(fixture.uploadChunkRepo)
                .deleteByIdImmediately(successfulCleanup.getId());
        verify(fixture.uploadChunkRepo, never()).deleteByUploadId(upload.getId());
    }

    @Test
    void discardCleansPrimaryPackageWhenPlannerMarksItSafe() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetVersionPackage primary = fixture.relation("package-primary", "PRIMARY", 0);
        DatasetPackageCleanupPlanDto cleanupPlan = new DatasetPackageCleanupPlanDto();
        cleanupPlan.setPackageId("package-primary");
        cleanupPlan.setCanDelete(true);
        DatasetPackage primaryPackage = fixture.datasetPackage("package-primary");

        when(fixture.versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(
                fixture.draft.getId()
        )).thenReturn(List.of(primary));
        when(fixture.cleanupPlanner.enqueueIfSafe("package-primary"))
                .thenReturn(cleanupPlan);
        when(fixture.packageRepo.findByIdAndDeletedFalse("package-primary"))
                .thenReturn(Optional.of(primaryPackage));

        fixture.service.discard(fixture.draft.getId());

        verify(fixture.cleanupPlanner).enqueueIfSafe("package-primary");
        verify(fixture.packageRepo).save(primaryPackage);
        assertTrue(Boolean.TRUE.equals(primaryPackage.getDeleted()));
        assertEquals("SUPERSEDED", primaryPackage.getStatus());
    }

    @Test
    void discardLocksDraftBeforeDeletingIt() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        when(fixture.uploadSessionRepo.findByVersionIdForUpdate(fixture.draft.getId()))
                .thenReturn(List.of());

        fixture.service.discard(fixture.draft.getId());

        InOrder lockOrder = inOrder(fixture.versionRepo, fixture.uploadSessionRepo);
        lockOrder.verify(fixture.versionRepo)
                .findByIdAndDeletedFalseForUpdate(fixture.draft.getId());
        lockOrder.verify(fixture.uploadSessionRepo)
                .findByVersionIdForUpdate(fixture.draft.getId());
        verify(fixture.uploadSessionRepo, never()).findByVersionId(anyString());
    }

    @Test
    void uploadSessionRepositoryExposesPessimisticWriteLookupByVersionId() {
        Method method = assertDoesNotThrow(
                () -> DatasetUploadSessionRepository.class.getMethod(
                        "findByVersionIdForUpdate",
                        String.class
                )
        );
        org.springframework.data.jpa.repository.Lock lock = method.getAnnotation(
                org.springframework.data.jpa.repository.Lock.class
        );

        assertNotNull(lock);
        assertEquals(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE, lock.value());
        assertNotNull(method.getAnnotation(org.springframework.data.jpa.repository.Query.class));
    }

    @Test
    void discardAlreadyDeletedOwnedDraftReturnsIdempotentResultWithoutCleanup() {
        Fixture fixture = new Fixture();
        Instant deletedAt = Instant.parse("2026-02-03T04:05:06Z");
        fixture.draft.setDeleted(true);
        fixture.draft.setDeletedAt(deletedAt);
        when(fixture.versionRepo.findByIdAndDeletedFalseForUpdate(fixture.draft.getId()))
                .thenReturn(Optional.empty());
        when(fixture.versionRepo.findById(fixture.draft.getId()))
                .thenReturn(Optional.of(fixture.draft));
        fixture.stubOwnedAsset();

        V2DatasetDiscardResult result = fixture.service.discard(fixture.draft.getId());

        assertEquals(fixture.draft.getId(), result.getEditSessionId());
        assertEquals(fixture.asset.getId(), result.getDatasetId());
        assertEquals("DISCARDED", result.getStatus());
        assertEquals(deletedAt, result.getDiscardedAt());
        verify(fixture.uploadSessionRepo, never()).findByVersionId(anyString());
        verify(fixture.uploadSessionRepo, never()).findByVersionIdForUpdate(anyString());
        verify(fixture.importJobRepo, never()).findByDatasetVersionId(anyString());
        verify(fixture.versionPackageRepo, never())
                .findByDatasetVersionIdOrderByPackageOrderAsc(anyString());
        verify(fixture.versionRepo, never()).saveAndFlush(any());
        verify(fixture.cleanupPlanner, never()).enqueueIfSafe(anyString());
        verify(fixture.deleteTaskService, never())
                .enqueueDefaultBucketDeleteImmediately(any(), any(), any(), any());
    }

    @Test
    void discardAlreadyDeletedDraftStillRequiresOwnership() {
        Fixture fixture = new Fixture();
        fixture.draft.setDeleted(true);
        fixture.draft.setDeletedAt(Instant.parse("2026-02-03T04:05:06Z"));
        when(fixture.versionRepo.findByIdAndDeletedFalseForUpdate(fixture.draft.getId()))
                .thenReturn(Optional.empty());
        when(fixture.versionRepo.findById(fixture.draft.getId()))
                .thenReturn(Optional.of(fixture.draft));
        when(fixture.assetRepo.findByIdAndDeletedFalse(fixture.asset.getId()))
                .thenReturn(Optional.of(fixture.asset));
        when(fixture.authContext.canAccessOwner(fixture.asset.getOwnerUserId()))
                .thenReturn(false);

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.discard(fixture.draft.getId())
        );

        assertEquals("DATASET_NOT_FOUND", error.getErrorCode());
        verify(fixture.uploadSessionRepo, never()).findByVersionId(anyString());
        verify(fixture.uploadSessionRepo, never()).findByVersionIdForUpdate(anyString());
        verify(fixture.versionRepo, never()).saveAndFlush(any());
    }

    @Test
    void discardAlreadyDeletedDraftWithoutDeletedAtReturnsFallbackTimestamp() {
        Fixture fixture = new Fixture();
        fixture.draft.setDeleted(true);
        fixture.draft.setDeletedAt(null);
        when(fixture.versionRepo.findByIdAndDeletedFalseForUpdate(fixture.draft.getId()))
                .thenReturn(Optional.empty());
        when(fixture.versionRepo.findById(fixture.draft.getId()))
                .thenReturn(Optional.of(fixture.draft));
        fixture.stubOwnedAsset();

        V2DatasetDiscardResult result = fixture.service.discard(fixture.draft.getId());

        assertNotNull(result.getDiscardedAt());
        verify(fixture.uploadSessionRepo, never()).findByVersionId(anyString());
        verify(fixture.uploadSessionRepo, never()).findByVersionIdForUpdate(anyString());
        verify(fixture.versionRepo, never()).saveAndFlush(any());
        verify(fixture.cleanupPlanner, never()).enqueueIfSafe(anyString());
    }

    @Test
    void discardDoesNotDeleteReadyVersionAfterConcurrentPublish() {
        Fixture fixture = new Fixture();
        DatasetVersion staleDraft = fixture.draft;
        DatasetVersion lockedReady = fixture.draft();
        lockedReady.setStatus("READY");
        fixture.stubEditSessionState();
        when(fixture.versionRepo.findByIdAndDeletedFalse(staleDraft.getId()))
                .thenReturn(Optional.of(staleDraft));
        when(fixture.versionRepo.findByIdAndDeletedFalseForUpdate(staleDraft.getId()))
                .thenReturn(Optional.of(lockedReady));
        when(fixture.importJobRepo.findByDatasetVersionId(staleDraft.getId()))
                .thenReturn(List.of());
        when(fixture.versionPackageRepo.findByDatasetVersionIdOrderByPackageOrderAsc(
                staleDraft.getId()
        )).thenReturn(List.of());

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.discard(staleDraft.getId())
        );

        assertEquals("DATASET_NOT_FOUND", error.getErrorCode());
        assertFalse(Boolean.TRUE.equals(lockedReady.getDeleted()));
        verify(fixture.versionRepo, never()).saveAndFlush(any());
    }

    @Test
    void olderFailedImportKeepsEditSessionNotPublishableWhenLatestImportSucceeds() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        ImportJob failed = fixture.importJob("FAILED", 0);
        failed.setId("job-failed");
        failed.setCreatedAt(Instant.parse("2026-01-10T00:00:00Z"));
        ImportJob succeeded = fixture.importJob("SUCCESS", 100);
        succeeded.setId("job-success");
        succeeded.setCreatedAt(Instant.parse("2026-01-11T00:00:00Z"));
        when(fixture.importJobRepo.findByDatasetVersionId(fixture.draft.getId()))
                .thenReturn(List.of(failed, succeeded));

        V2DatasetEditSessionDto result =
                fixture.service.getEditSession(fixture.draft.getId());

        assertFalse(result.getCanPublish());
        assertEquals("job-failed", result.getImportJobId());
        assertEquals("IMPORT_FAILED", result.getDisplayStatus());
        assertFalse(result.getAvailableActions().contains("PUBLISH"));
    }

    @Test
    void partialImportKeepsEditSessionNotPublishableWithPartialDisplay() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        ImportJob partial = fixture.importJob("PARTIAL", 50);
        partial.setId("job-partial");
        partial.setTotalSamples(2);
        partial.setImportedSamples(1);
        partial.setErrorCode("PARTIAL_IMPORT_FAILED");
        partial.setErrorMessage("部分样本导入失败，可增量重试");
        partial.setErrorDetailsJson("{\"failedSamples\":1,\"totalSamples\":2}");
        when(fixture.importJobRepo.findByDatasetVersionId(fixture.draft.getId()))
                .thenReturn(List.of(partial));

        V2DatasetEditSessionDto result =
                fixture.service.getEditSession(fixture.draft.getId());

        assertFalse(result.getCanPublish());
        assertEquals("job-partial", result.getImportJobId());
        assertEquals("IMPORT_PARTIAL", result.getDisplayStatus());
        assertEquals(50, result.getImportProgress());
        assertEquals("PARTIAL_IMPORT_FAILED", result.getUserError().getErrorCode());
        assertEquals(1, result.getUserError().getDetails().get("failedSamples"));
        assertFalse(result.getAvailableActions().contains("PUBLISH"));
    }

    @Test
    void newerRunningImportTakesPriorityOverOlderFailedImport() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        ImportJob failed = fixture.importJob("FAILED", 0);
        failed.setId("job-failed");
        failed.setCreatedAt(Instant.parse("2026-01-10T00:00:00Z"));
        ImportJob running = fixture.importJob("RUNNING", 45);
        running.setId("job-running");
        running.setCreatedAt(Instant.parse("2026-01-11T00:00:00Z"));
        when(fixture.importJobRepo.findByDatasetVersionId(fixture.draft.getId()))
                .thenReturn(List.of(failed, running));

        V2DatasetEditSessionDto result =
                fixture.service.getEditSession(fixture.draft.getId());

        assertEquals("job-running", result.getImportJobId());
        assertEquals("IMPORTING", result.getDisplayStatus());
        assertEquals(45, result.getImportProgress());
        assertNull(result.getUserError());
        assertFalse(result.getCanPublish());
    }

    @Test
    void publishFailureExposesConcreteReasonInDetails() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        when(fixture.publishService.publish(fixture.draft.getId()))
                .thenThrow(new IllegalArgumentException("ImportJob retry requires DRAFT dataset version"));

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.publish(fixture.draft.getId())
        );

        assertEquals("DATASET_NOT_PUBLISHABLE", error.getErrorCode());
        assertEquals("ImportJob retry requires DRAFT dataset version", error.getDetails().get("reason"));
    }

    @Test
    void publishIsTransactionalAtV2Boundary() throws Exception {
        Method method = V2DatasetEditService.class.getDeclaredMethod("publish", String.class);

        assertTrue(method.isAnnotationPresent(Transactional.class));
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void publishLogsCompletedResultWithoutInternalPaths(CapturedOutput output) {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        DatasetWorkspacePublishDto published = new DatasetWorkspacePublishDto();
        published.setDatasetAssetId(fixture.asset.getId());
        published.setDatasetVersionId("ready-3");
        published.setVersionNo(3);
        published.setStatus("READY");
        published.setPublishedAt(Instant.parse("2026-03-04T05:06:07Z"));
        when(fixture.publishService.publish(fixture.draft.getId()))
                .thenReturn(published);

        V2DatasetPublishResult result = fixture.service.publish(fixture.draft.getId());

        assertEquals(fixture.asset.getId(), result.getDatasetId());
        assertEquals("v3", result.getCurrentVersion());
        assertEquals("READY", result.getStatus());
        String logs = output.getOut() + output.getErr();
        assertTrue(logs.contains("V2 dataset publish completed"));
        assertTrue(logs.contains("datasetId=" + fixture.asset.getId()));
        assertTrue(logs.contains("editSessionId=" + fixture.draft.getId()));
        assertTrue(logs.contains("versionId=ready-3"));
        assertTrue(logs.contains("status=READY"));
        assertFalse(logs.contains("storagePath"));
        assertFalse(logs.contains("objectName"));
    }

    @Test
    void publishMapsInnerMissingDraftFailureToNotFound() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        when(fixture.publishService.publish(fixture.draft.getId()))
                .thenThrow(new IllegalArgumentException(
                        "dataset workspace version not found or no permission"
                ));

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.publish(fixture.draft.getId())
        );

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("DATASET_NOT_FOUND", error.getErrorCode());
        assertEquals("数据集编辑会话不存在或无权访问", error.getMessage());
        assertEquals(
                "dataset workspace version not found or no permission",
                error.getDetails().get("reason")
        );
    }

    @Test
    void publishFailureDoesNotExposeInfrastructureReasonDetails() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        when(fixture.publishService.publish(fixture.draft.getId()))
                .thenThrow(new IllegalArgumentException(
                        "MinIO bucket=models object=secret.zip"
                ));

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.publish(fixture.draft.getId())
        );

        String reason = String.valueOf(error.getDetails().get("reason"));
        assertFalse(reason.contains("MinIO"));
        assertFalse(reason.contains("bucket=models"));
        assertFalse(reason.contains("secret.zip"));
    }

    @Test
    void publishMapsInnerNoLongerDraftFailureToNotFound() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        when(fixture.publishService.publish(fixture.draft.getId()))
                .thenThrow(new IllegalArgumentException("dataset version must be DRAFT"));

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.publish(fixture.draft.getId())
        );

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("DATASET_NOT_FOUND", error.getErrorCode());
        assertEquals("dataset version must be DRAFT", error.getDetails().get("reason"));
    }

    @Test
    void publishMapsInnerNoLongerDraftFailureWithSuffixToNotFound() {
        Fixture fixture = new Fixture();
        fixture.stubEditSessionState();
        when(fixture.publishService.publish(fixture.draft.getId()))
                .thenThrow(new IllegalArgumentException("dataset version must be DRAFT: draft-1"));

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> fixture.service.publish(fixture.draft.getId())
        );

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("DATASET_NOT_FOUND", error.getErrorCode());
        assertEquals("dataset version must be DRAFT: draft-1", error.getDetails().get("reason"));
    }

    private static final class Fixture {
        private final DatasetAssetRepository assetRepo = mock(DatasetAssetRepository.class);
        private final DatasetVersionRepository versionRepo = mock(DatasetVersionRepository.class);
        private final DatasetUploadSessionRepository uploadSessionRepo =
                mock(DatasetUploadSessionRepository.class);
        private final ImportJobRepository importJobRepo = mock(ImportJobRepository.class);
        private final DatasetVersionPackageRepository versionPackageRepo =
                mock(DatasetVersionPackageRepository.class);
        private final DatasetPackageRepository packageRepo = mock(DatasetPackageRepository.class);
        private final DatasetUploadChunkRepository uploadChunkRepo =
                mock(DatasetUploadChunkRepository.class);
        private final DatasetSampleRepository sampleRepo = mock(DatasetSampleRepository.class);
        private final DatasetPackageCleanupPlannerService cleanupPlanner =
                mock(DatasetPackageCleanupPlannerService.class);
        private final MinioDeleteTaskService deleteTaskService =
                mock(MinioDeleteTaskService.class);
        private final AuthContext authContext = mock(AuthContext.class);
        private final DatasetWorkspaceService workspaceService =
                mock(DatasetWorkspaceService.class);
        private final DatasetWorkspacePublishService publishService =
                mock(DatasetWorkspacePublishService.class);
        private final V2DatasetUploadService uploadService =
                mock(V2DatasetUploadService.class);
        private final V2DatasetEditService service = new V2DatasetEditService(
                assetRepo,
                versionRepo,
                uploadSessionRepo,
                importJobRepo,
                versionPackageRepo,
                packageRepo,
                uploadChunkRepo,
                sampleRepo,
                cleanupPlanner,
                deleteTaskService,
                authContext,
                workspaceService,
                publishService,
                uploadService,
                new ObjectMapper()
        );
        private final DatasetAsset asset = asset();
        private final DatasetVersion draft = draft();

        private void stubOwnedAsset() {
            when(assetRepo.findByIdAndDeletedFalse(asset.getId()))
                    .thenReturn(Optional.of(asset));
            when(authContext.canAccessOwner(asset.getOwnerUserId())).thenReturn(true);
        }

        private void stubEditSessionState() {
            when(versionRepo.findByIdAndDeletedFalse(draft.getId()))
                    .thenReturn(Optional.of(draft));
            when(versionRepo.findByIdAndDeletedFalseForUpdate(draft.getId()))
                    .thenReturn(Optional.of(draft));
            when(assetRepo.findByIdAndDeletedFalse(asset.getId()))
                    .thenReturn(Optional.of(asset));
            when(authContext.canAccessOwner(asset.getOwnerUserId())).thenReturn(true);
            when(uploadSessionRepo
                    .findFirstByVersionIdAndUploadPurposeOrderByCreatedAtDesc(
                            draft.getId(),
                            "APPEND_PACKAGE"
                    ))
                    .thenReturn(Optional.empty());
            when(importJobRepo.findByDatasetVersionId(draft.getId())).thenReturn(List.of());
            when(sampleRepo.countByDatasetVersionIdAndDeletedFalse(draft.getId()))
                    .thenReturn(1L);
        }

        private DatasetUploadSession uploadSession() {
            DatasetUploadSession session = new DatasetUploadSession();
            session.setId("upload-1");
            session.setVersionId(draft.getId());
            session.setUploadPurpose("APPEND_PACKAGE");
            session.setStatus("COMPLETED");
            return session;
        }

        private DatasetVersionPackage relation(
                String packageId,
                String packageRole,
                int packageOrder
        ) {
            DatasetVersionPackage relation = new DatasetVersionPackage();
            relation.setDatasetVersionId(draft.getId());
            relation.setPackageId(packageId);
            relation.setPackageRole(packageRole);
            relation.setPackageOrder(packageOrder);
            return relation;
        }

        private DatasetPackage datasetPackage(String packageId) {
            DatasetPackage datasetPackage = new DatasetPackage();
            datasetPackage.setId(packageId);
            datasetPackage.setDatasetAssetId(asset.getId());
            datasetPackage.setStoragePath("users/7/datasets/asset-1/" + packageId + ".zip");
            datasetPackage.setFileName(packageId + ".zip");
            datasetPackage.setSizeBytes(1024L);
            datasetPackage.setStatus("READY");
            datasetPackage.setDeleted(false);
            return datasetPackage;
        }

        private ImportJob importJob(String status, int progress) {
            ImportJob job = new ImportJob();
            job.setId("job-1");
            job.setDatasetVersionId(draft.getId());
            job.setStatus(status);
            job.setProgress(progress);
            return job;
        }

        private DatasetAsset asset() {
            DatasetAsset value = new DatasetAsset();
            value.setId("asset-1");
            value.setName("multimodal");
            value.setType("MULTIMODAL");
            value.setCurrentVersionId("ready-1");
            value.setOwnerUserId(7);
            value.setDeleted(false);
            return value;
        }

        private DatasetVersion draft() {
            DatasetVersion value = new DatasetVersion();
            value.setId("draft-2");
            value.setAssetId("asset-1");
            value.setVersion("v2");
            value.setVersionLabel("v2");
            value.setVersionNo(2);
            value.setStatus("DRAFT");
            value.setOwnerUserId(7);
            value.setDeleted(false);
            return value;
        }
    }
}
