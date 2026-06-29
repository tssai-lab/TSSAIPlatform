package com.tss.platform.service;

import com.tss.platform.dto.DatasetWorkspaceDraftDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DatasetWorkspaceServiceTest {

    @Test
    void createsMaterializedDraftFromReadyWithoutChangingCurrentVersion() {
        Fixture fixture = new Fixture();
        fixture.stubOwnedReady();
        when(fixture.versionRepo.findMaxVersionNoByAssetId(fixture.asset.getId()))
                .thenReturn(2);
        when(fixture.versionRepo.existsByAssetIdAndVersion(fixture.asset.getId(), "v3"))
                .thenReturn(false);
        when(fixture.versionRepo.save(any(DatasetVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        DatasetWorkspaceDraftDto result =
                fixture.service.createDraft(fixture.parent.getId());

        assertEquals(fixture.parent.getId(), result.getParentVersionId());
        assertEquals(fixture.asset.getId(), result.getDatasetAssetId());
        assertEquals(3, result.getVersionNo());
        assertEquals("DRAFT", result.getStatus());
        assertEquals(fixture.parent.getId(), result.getCurrentVersionId());
        assertEquals(fixture.parent.getId(), fixture.asset.getCurrentVersionId());

        ArgumentCaptor<DatasetVersion> captor = ArgumentCaptor.forClass(DatasetVersion.class);
        verify(fixture.versionRepo).save(captor.capture());
        DatasetVersion draft = captor.getValue();
        assertEquals(fixture.parent.getId(), draft.getParentVersionId());
        assertEquals(fixture.asset.getId(), draft.getAssetId());
        assertEquals(3, draft.getVersionNo());
        assertEquals("v3", draft.getVersion());
        assertEquals("v3", draft.getVersionLabel());
        assertEquals("DRAFT", draft.getStatus());
        assertEquals(fixture.parent.getStoragePath(), draft.getStoragePath());
        assertEquals(fixture.parent.getFileName(), draft.getFileName());
        assertEquals(fixture.parent.getSizeBytes(), draft.getSizeBytes());
        assertEquals(fixture.parent.getFileFingerprint(), draft.getFileFingerprint());
        assertEquals(fixture.parent.getCvTaskType(), draft.getCvTaskType());
        assertEquals(fixture.parent.getAnnotationFormat(), draft.getAnnotationFormat());
        assertNull(draft.getPublishedAt());
        assertFalse(Boolean.TRUE.equals(draft.getDeleted()));
        verify(fixture.assetRepo, never()).save(any(DatasetAsset.class));
        verify(fixture.materializer).materialize(fixture.asset, fixture.parent, draft);
    }

    @Test
    void propagatesMaterializationFailureSoDraftTransactionCanRollBack() {
        Fixture fixture = new Fixture();
        fixture.stubOwnedReady();
        when(fixture.versionRepo.findMaxVersionNoByAssetId(fixture.asset.getId()))
                .thenReturn(2);
        when(fixture.versionRepo.existsByAssetIdAndVersion(fixture.asset.getId(), "v3"))
                .thenReturn(false);
        when(fixture.versionRepo.save(any(DatasetVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(new IllegalStateException("copy failed"))
                .when(fixture.materializer)
                .materialize(
                        eq(fixture.asset),
                        eq(fixture.parent),
                        any(DatasetVersion.class)
                );

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> fixture.service.createDraft(fixture.parent.getId())
        );

        assertEquals("copy failed", error.getMessage());
        verify(fixture.assetRepo, never()).save(any(DatasetAsset.class));
    }

    @Test
    void allowsPackageBackedParentWithoutLegacyVersionStoragePath() {
        Fixture fixture = new Fixture();
        fixture.parent.setStoragePath(null);
        fixture.stubOwnedReady();
        when(fixture.versionRepo.findMaxVersionNoByAssetId(fixture.asset.getId()))
                .thenReturn(2);
        when(fixture.versionRepo.existsByAssetIdAndVersion(fixture.asset.getId(), "v3"))
                .thenReturn(false);
        when(fixture.versionRepo.save(any(DatasetVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        DatasetWorkspaceDraftDto result =
                fixture.service.createDraft(fixture.parent.getId());

        assertEquals("DRAFT", result.getStatus());
        ArgumentCaptor<DatasetVersion> draftCaptor =
                ArgumentCaptor.forClass(DatasetVersion.class);
        verify(fixture.materializer).materialize(
                eq(fixture.asset),
                eq(fixture.parent),
                draftCaptor.capture()
        );
        assertNull(draftCaptor.getValue().getStoragePath());
    }

    @Test
    void rejectsDraftDeprecatedAndArchivedSources() {
        for (String status : new String[]{"DRAFT", "DEPRECATED", "ARCHIVED"}) {
            Fixture fixture = new Fixture();
            fixture.parent.setStatus(status);
            fixture.stubOwnedParent();

            IllegalArgumentException error = assertThrows(
                    IllegalArgumentException.class,
                    () -> fixture.service.createDraft(fixture.parent.getId())
            );

            assertEquals(
                    "dataset version must be READY: " + fixture.parent.getId()
                            + ", status=" + status,
                    error.getMessage()
            );
            verify(fixture.versionRepo, never()).save(any(DatasetVersion.class));
        }
    }

    @Test
    void rejectsDeletedSource() {
        Fixture fixture = new Fixture();
        when(fixture.versionRepo.findByIdAndDeletedFalseForUpdate(fixture.parent.getId()))
                .thenReturn(Optional.empty());

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> fixture.service.createDraft(fixture.parent.getId())
        );

        assertEquals("dataset version not found or no permission", error.getMessage());
        verify(fixture.versionRepo, never()).save(any(DatasetVersion.class));
    }

    @Test
    void rejectsExistingDraftWithExplicitVersionId() {
        Fixture fixture = new Fixture();
        fixture.stubOwnedReady();
        DatasetVersion existingDraft = new DatasetVersion();
        existingDraft.setId("draft-existing");
        existingDraft.setStatus("DRAFT");
        when(fixture.versionRepo.findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                fixture.asset.getId(),
                "DRAFT"
        )).thenReturn(Optional.of(existingDraft));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> fixture.service.createDraft(fixture.parent.getId())
        );

        assertEquals(
                "dataset asset already has an active DRAFT version: draft-existing",
                error.getMessage()
        );
        verify(fixture.versionRepo, never()).save(any(DatasetVersion.class));
    }

    @Test
    void rejectsOtherUsersVersionWithoutRevealingStatus() {
        Fixture fixture = new Fixture();
        fixture.parent.setStatus("DRAFT");
        when(fixture.versionRepo.findByIdAndDeletedFalseForUpdate(fixture.parent.getId()))
                .thenReturn(Optional.of(fixture.parent));
        when(fixture.assetRepo.findByIdAndDeletedFalseForUpdate(fixture.asset.getId()))
                .thenReturn(Optional.of(fixture.asset));
        when(fixture.authContext.canAccessOwner(fixture.asset.getOwnerUserId()))
                .thenReturn(false);

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> fixture.service.createDraft(fixture.parent.getId())
        );

        assertEquals("dataset version not found or no permission", error.getMessage());
        verify(fixture.versionRepo, never()).save(any(DatasetVersion.class));
    }

    private static final class Fixture {
        private final DatasetVersionRepository versionRepo =
                mock(DatasetVersionRepository.class);
        private final DatasetAssetRepository assetRepo =
                mock(DatasetAssetRepository.class);
        private final AuthContext authContext = mock(AuthContext.class);
        private final DatasetVersionLifecycleService lifecycle =
                new DatasetVersionLifecycleService(versionRepo);
        private final DatasetWorkspaceMaterializer materializer =
                mock(DatasetWorkspaceMaterializer.class);
        private final DatasetWorkspaceService service =
                new DatasetWorkspaceService(
                        versionRepo,
                        assetRepo,
                        authContext,
                        lifecycle,
                        materializer
                );
        private final DatasetAsset asset = asset();
        private final DatasetVersion parent = parent();

        private void stubOwnedReady() {
            stubOwnedParent();
            when(versionRepo.findTopByAssetIdAndDeletedFalseAndStatusOrderByVersionNoDesc(
                    asset.getId(),
                    "DRAFT"
            )).thenReturn(Optional.empty());
        }

        private void stubOwnedParent() {
            when(versionRepo.findByIdAndDeletedFalseForUpdate(parent.getId()))
                    .thenReturn(Optional.of(parent));
            when(assetRepo.findByIdAndDeletedFalseForUpdate(asset.getId()))
                    .thenReturn(Optional.of(asset));
            when(authContext.canAccessOwner(asset.getOwnerUserId())).thenReturn(true);
            when(authContext.currentUserId()).thenReturn(7);
        }

        private static DatasetAsset asset() {
            DatasetAsset asset = new DatasetAsset();
            asset.setId("asset-1");
            asset.setOwnerUserId(7);
            asset.setCurrentVersionId("ready-2");
            asset.setDeleted(false);
            return asset;
        }

        private static DatasetVersion parent() {
            DatasetVersion version = new DatasetVersion();
            version.setId("ready-2");
            version.setAssetId("asset-1");
            version.setVersion("v2");
            version.setVersionLabel("v2");
            version.setVersionNo(2);
            version.setStatus("READY");
            version.setStoragePath("users/7/datasets/asset-1/v2/data.zip");
            version.setFileName("data.zip");
            version.setSizeBytes(1000L);
            version.setFileFingerprint("sha256:abc");
            version.setCvTaskType("CLASSIFICATION");
            version.setAnnotationFormat("COCO");
            version.setOwnerUserId(7);
            version.setDeleted(false);
            return version;
        }
    }
}
