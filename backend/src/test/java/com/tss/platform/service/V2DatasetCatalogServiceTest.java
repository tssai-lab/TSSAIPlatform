package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.PageResponse;
import com.tss.platform.dto.v2.V2DatasetListItem;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class V2DatasetCatalogServiceTest {

    @Test
    void exposesPageReadyFieldsWithoutInternalStorageOrJobIds() throws Exception {
        Fixture fixture = new Fixture();
        DatasetAsset asset = fixture.asset();
        DatasetVersion ready = fixture.version("ready-1", "READY", 1);
        asset.setCurrentVersionId(ready.getId());
        fixture.stub(List.of(asset), List.of(ready), List.of());
        when(fixture.fileCountService.countCurrentVersionFiles(asset, ready)).thenReturn(9L);

        PageResponse<V2DatasetListItem> page =
                fixture.service.list(null, null, null, null, null);

        V2DatasetListItem item = page.getData().get(0);
        assertEquals(asset.getId(), item.getDatasetId());
        assertEquals(ready.getId(), item.getCurrentVersion().getVersionId());
        assertEquals("v1", item.getCurrentVersion().getVersionLabel());
        assertEquals(1, item.getCurrentVersion().getVersionNo());
        assertEquals("READY", item.getCurrentVersion().getStatus());
        assertEquals("READY", item.getDisplayStatus());
        assertEquals(9L, item.getCurrentVersionFileCount());
        assertFalse(item.getHasDraft());
        assertNull(item.getEditSessionId());
        assertTrue(item.getAvailableActions().contains("PREVIEW"));
        assertTrue(item.getAvailableActions().contains("EDIT"));
        assertFalse(item.getAvailableActions().contains("PUBLISH"));

        String json = new ObjectMapper().writeValueAsString(item);
        assertTrue(json.contains("\"currentVersionFileCount\":9"));
        assertTrue(json.contains("\"fileCount\":9"));
        assertFalse(json.contains("storagePath"));
        assertFalse(json.contains("ownerUserId"));
        assertFalse(json.contains("currentVersionId"));
        assertFalse(json.contains("importJobId"));
        assertFalse(json.contains("errorDetailsJson"));
    }

    @Test
    void failedImportTakesPriorityAndReturnsSanitizedUserError() {
        Fixture fixture = new Fixture();
        DatasetAsset asset = fixture.asset();
        DatasetVersion ready = fixture.version("ready-1", "READY", 1);
        DatasetVersion draft = fixture.version("draft-2", "DRAFT", 2);
        asset.setCurrentVersionId(ready.getId());
        ImportJob job = fixture.job(draft.getId(), "FAILED", 0);
        job.setErrorCode("DUPLICATE_SAMPLE");
        job.setErrorMessage("上传内容包含已存在的样本");
        job.setErrorDetailsJson("{\"sampleName\":\"scene-1\"}");
        fixture.stub(List.of(asset), List.of(ready, draft), List.of(job));

        V2DatasetListItem item = fixture.service
                .list(null, null, 1, null, 20)
                .getData()
                .get(0);

        assertEquals("IMPORT_FAILED", item.getDisplayStatus());
        assertTrue(item.getHasDraft());
        assertEquals(draft.getId(), item.getEditSessionId());
        assertFalse(item.getCanPublish());
        assertEquals("DUPLICATE_SAMPLE", item.getUserError().getErrorCode());
        assertEquals("scene-1", item.getUserError().getDetails().get("sampleName"));
        assertTrue(item.getAvailableActions().contains("ADD_DATA"));
        assertFalse(item.getAvailableActions().contains("PUBLISH"));
    }

    @Test
    void runningImportTakesPriorityOverEditing() {
        Fixture fixture = new Fixture();
        DatasetAsset asset = fixture.asset();
        DatasetVersion draft = fixture.version("draft-1", "DRAFT", 1);
        ImportJob job = fixture.job(draft.getId(), "RUNNING", 45);
        fixture.stub(List.of(asset), List.of(draft), List.of(job));

        V2DatasetListItem item = fixture.service
                .list(null, null, null, null, null)
                .getData()
                .get(0);

        assertEquals("IMPORTING", item.getDisplayStatus());
        assertEquals(45, item.getImportProgress());
        assertFalse(item.getCanPublish());
    }

    @Test
    void draftWithoutSamplesIsNotPublishable() {
        Fixture fixture = new Fixture();
        DatasetAsset asset = fixture.asset();
        DatasetVersion draft = fixture.version("draft-1", "DRAFT", 1);
        fixture.stub(List.of(asset), List.of(draft), List.of());
        when(fixture.sampleRepo.countByDatasetVersionIdAndDeletedFalse(draft.getId()))
                .thenReturn(0L);

        V2DatasetListItem item = fixture.service
                .list(null, null, null, null, null)
                .getData()
                .get(0);

        assertFalse(item.getCanPublish());
        assertFalse(item.getAvailableActions().contains("PUBLISH"));
    }

    @Test
    void olderFailedImportKeepsDraftNotPublishableWhenLatestImportSucceeds() {
        Fixture fixture = new Fixture();
        DatasetAsset asset = fixture.asset();
        DatasetVersion draft = fixture.version("draft-1", "DRAFT", 1);
        ImportJob failed = fixture.job(draft.getId(), "FAILED", 0);
        failed.setId("job-failed");
        failed.setCreatedAt(Instant.parse("2026-01-10T00:00:00Z"));
        ImportJob succeeded = fixture.job(draft.getId(), "SUCCESS", 100);
        succeeded.setId("job-success");
        succeeded.setCreatedAt(Instant.parse("2026-01-11T00:00:00Z"));
        fixture.stub(List.of(asset), List.of(draft), List.of(failed, succeeded));

        V2DatasetListItem item = fixture.service
                .list(null, null, null, null, null)
                .getData()
                .get(0);

        assertFalse(item.getCanPublish());
        assertFalse(item.getAvailableActions().contains("PUBLISH"));
    }

    @Test
    void listItemSerializationDoesNotExposeInternalStorageFields() throws Exception {
        Fixture fixture = new Fixture();
        DatasetAsset asset = fixture.asset();
        DatasetVersion ready = fixture.version("ready-1", "READY", 1);
        ready.setStoragePath("users/7/datasets/asset-1/v1/data.zip");
        asset.setCurrentVersionId(ready.getId());
        fixture.stub(List.of(asset), List.of(ready), List.of());

        PageResponse<V2DatasetListItem> page =
                fixture.service.list("MULTIMODAL", null, 1, null, 20);

        String json = new ObjectMapper().writeValueAsString(page);
        assertFalse(json.contains("storagePath"));
        assertFalse(json.contains("ownerUserId"));
        assertFalse(json.contains("packageId"));
        assertFalse(json.contains("zipDataOffset"));
        assertFalse(json.contains("compressedSize"));
    }

    @Test
    void enrichesOnlyAssetsReturnedByDatabasePage() {
        Fixture fixture = new Fixture();
        DatasetAsset first = fixture.asset("asset-1", "first");
        DatasetAsset second = fixture.asset("asset-2", "second");
        DatasetVersion firstReady = fixture.version("ready-1", "asset-1", "READY", 1);
        DatasetVersion secondReady = fixture.version("ready-2", "asset-2", "READY", 1);
        first.setCurrentVersionId(firstReady.getId());
        second.setCurrentVersionId(secondReady.getId());
        fixture.stubPage(List.of(second), 2L, List.of(secondReady), List.of());
        when(fixture.fileCountService.countCurrentVersionFiles(second, secondReady)).thenReturn(22L);

        PageResponse<V2DatasetListItem> page = fixture.service.list(null, null, 2, null, 1);

        assertEquals(2L, page.getTotal());
        assertEquals(2, page.getPage());
        assertEquals(1, page.getPageSize());
        assertEquals(1, page.getData().size());
        assertEquals("asset-2", page.getData().get(0).getDatasetId());
        assertEquals(22L, page.getData().get(0).getFileCount());
        verify(fixture.fileCountService).countCurrentVersionFiles(second, secondReady);
        verify(fixture.fileCountService, never()).countCurrentVersionFiles(first, firstReady);
    }

    private static final class Fixture {
        private final DatasetAssetRepository assetRepo = mock(DatasetAssetRepository.class);
        private final DatasetVersionRepository versionRepo = mock(DatasetVersionRepository.class);
        private final ImportJobRepository importJobRepo = mock(ImportJobRepository.class);
        private final DatasetSampleRepository sampleRepo = mock(DatasetSampleRepository.class);
        private final DatasetVersionFileCountService fileCountService =
                mock(DatasetVersionFileCountService.class);
        private final AuthContext authContext = mock(AuthContext.class);
        private final V2DatasetCatalogService service = new V2DatasetCatalogService(
                assetRepo,
                versionRepo,
                importJobRepo,
                sampleRepo,
                fileCountService,
                authContext,
                new ObjectMapper()
        );

        private void stub(
                List<DatasetAsset> assets,
                List<DatasetVersion> versions,
                List<ImportJob> jobs
        ) {
            when(authContext.isAdmin()).thenReturn(false);
            when(authContext.currentUserId()).thenReturn(7);
            stubPage(assets, assets.size(), versions, jobs);
        }

        private void stubPage(
                List<DatasetAsset> assets,
                long total,
                List<DatasetVersion> versions,
                List<ImportJob> jobs
        ) {
            when(authContext.isAdmin()).thenReturn(false);
            when(authContext.currentUserId()).thenReturn(7);
            when(assetRepo.searchCatalogForOwner(
                    eq(7),
                    nullable(String.class),
                    nullable(String.class),
                    org.mockito.ArgumentMatchers.any(Pageable.class)
            )).thenReturn(new PageImpl<>(assets, Pageable.unpaged(), total));
            when(versionRepo.findByAssetIdInAndDeletedFalse(anyCollection())).thenReturn(versions);
            when(importJobRepo.findByDatasetVersionIdIn(anyCollection())).thenReturn(jobs);
            for (DatasetVersion version : versions) {
                if ("DRAFT".equals(version.getStatus())) {
                    when(sampleRepo.countByDatasetVersionIdAndDeletedFalse(version.getId()))
                            .thenReturn(1L);
                }
            }
        }

        private DatasetAsset asset() {
            DatasetAsset asset = new DatasetAsset();
            asset.setId("asset-1");
            asset.setName("multimodal");
            asset.setType("MULTIMODAL");
            asset.setOwnerUserId(7);
            asset.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
            asset.setUpdatedAt(asset.getCreatedAt());
            asset.setDeleted(false);
            return asset;
        }

        private DatasetAsset asset(String id, String name) {
            DatasetAsset asset = asset();
            asset.setId(id);
            asset.setName(name);
            return asset;
        }

        private DatasetVersion version(String id, String status, int versionNo) {
            return version(id, "asset-1", status, versionNo);
        }

        private DatasetVersion version(String id, String assetId, String status, int versionNo) {
            DatasetVersion version = new DatasetVersion();
            version.setId(id);
            version.setAssetId(assetId);
            version.setVersion("v" + versionNo);
            version.setVersionLabel("v" + versionNo);
            version.setVersionNo(versionNo);
            version.setStatus(status);
            version.setOwnerUserId(7);
            version.setCreatedAt(Instant.parse("2026-01-0" + versionNo + "T00:00:00Z"));
            version.setDeleted(false);
            return version;
        }

        private ImportJob job(String versionId, String status, int progress) {
            ImportJob job = new ImportJob();
            job.setId("job-" + versionId);
            job.setDatasetVersionId(versionId);
            job.setStatus(status);
            job.setProgress(progress);
            job.setCreatedAt(Instant.parse("2026-01-10T00:00:00Z"));
            return job;
        }
    }
}
