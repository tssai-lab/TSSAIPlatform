package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.DatasetWorkspaceDraftDto;
import com.tss.platform.dto.DatasetWorkspacePublishDto;
import com.tss.platform.dto.v2.V2DatasetEditSessionDto;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
        assertFalse(result.getAvailableActions().contains("PUBLISH"));
    }

    private static final class Fixture {
        private final DatasetAssetRepository assetRepo = mock(DatasetAssetRepository.class);
        private final DatasetVersionRepository versionRepo = mock(DatasetVersionRepository.class);
        private final DatasetUploadSessionRepository uploadSessionRepo =
                mock(DatasetUploadSessionRepository.class);
        private final ImportJobRepository importJobRepo = mock(ImportJobRepository.class);
        private final DatasetSampleRepository sampleRepo = mock(DatasetSampleRepository.class);
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
                sampleRepo,
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
