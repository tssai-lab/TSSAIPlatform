package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.v2.V2ModelUploadDto;
import com.tss.platform.dto.v2.V2ModelUploadInitRequest;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelUploadChunk;
import com.tss.platform.entity.ModelUploadSession;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelUploadChunkRepository;
import com.tss.platform.repository.ModelUploadSessionRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.security.AuthContext;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import okhttp3.Headers;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ModelUploadServiceV2Test {

    @Test
    void initPersistsFileAndBusinessMetadata() {
        Fixture fixture = new Fixture();
        when(fixture.sessionRepo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        V2ModelUploadDto result = fixture.service.initV2(fixture.request());

        ArgumentCaptor<ModelUploadSession> captor =
                ArgumentCaptor.forClass(ModelUploadSession.class);
        verify(fixture.sessionRepo).save(captor.capture());
        ModelUploadSession session = captor.getValue();
        assertEquals("model.zip", session.getFileName());
        assertEquals("Detector", session.getModelName());
        assertEquals("v1", session.getModelVersion());
        assertEquals("CV", session.getTaskType());
        assertEquals("detector model", session.getRemark());
        assertNull(session.getTargetAssetId());
        assertEquals(session.getId(), result.getUploadId());
        assertEquals("Detector", result.getModelName());
    }

    @Test
    void fingerprintResumeRequiresMatchingBusinessMetadata() {
        Fixture fixture = new Fixture();
        ModelUploadSession existing = fixture.session();
        existing.setModelVersion("v0");
        when(fixture.sessionRepo
                .findFirstByFileFingerprintAndStatusAndOwnerUserIdOrderByUpdatedAtDesc(
                        "sha256:abc",
                        "UPLOADING",
                        7
                ))
                .thenReturn(Optional.of(existing));
        when(fixture.sessionRepo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        V2ModelUploadDto result = fixture.service.initV2(fixture.request());

        assertNotEquals(existing.getId(), result.getUploadId());
        assertEquals("v1", result.getModelVersion());
    }

    @Test
    void completeUsesBusinessMetadataStoredInSession() throws Exception {
        Fixture fixture = new Fixture();
        ModelUploadSession session = fixture.session();
        ModelUploadChunk chunk = new ModelUploadChunk();
        chunk.setUploadId(session.getId());
        chunk.setPartIndex(0);
        chunk.setObjectName("users/7/models/_uploads/upload-1/part-0");
        chunk.setSizeBytes(session.getFileSize());
        when(fixture.sessionRepo.findById(session.getId())).thenReturn(Optional.of(session));
        when(fixture.sessionRepo.updateStatusIfCurrent(any(), any(), any(), any(), any()))
                .thenReturn(1);
        when(fixture.sessionRepo.saveAndFlush(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(fixture.chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId()))
                .thenReturn(List.of(chunk));
        when(fixture.assetRepo.saveAndFlush(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(fixture.versionRepo.saveAndFlush(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(fixture.minioClient.getObject(any())).thenReturn(new GetObjectResponse(
                new Headers.Builder().build(),
                "models",
                null,
                "model.zip",
                new ByteArrayInputStream(zipBytes())
        ));

        V2ModelUploadDto result = fixture.service.completeV2(session.getId());

        ArgumentCaptor<ModelAsset> assetCaptor = ArgumentCaptor.forClass(ModelAsset.class);
        verify(fixture.assetRepo).saveAndFlush(assetCaptor.capture());
        assertEquals("Detector", assetCaptor.getValue().getName());
        assertEquals("CV", assetCaptor.getValue().getType());
        ArgumentCaptor<ModelVersion> versionCaptor =
                ArgumentCaptor.forClass(ModelVersion.class);
        verify(fixture.versionRepo).saveAndFlush(versionCaptor.capture());
        assertEquals("v1", versionCaptor.getValue().getVersion());
        assertEquals("COMPLETED", result.getStatus());
        assertTrue(result.getModelId().startsWith("model-ver-"));
        String json = new ObjectMapper()
                .findAndRegisterModules()
                .writeValueAsString(result);
        assertTrue(!json.contains("storagePath"));
        assertTrue(!json.contains("ownerUserId"));
    }

    @Test
    void duplicateVersionReturnsConflictStatus() {
        Fixture fixture = new Fixture();
        ModelUploadSession session = fixture.session();
        session.setTargetAssetId("asset-1");
        ModelAsset asset = new ModelAsset();
        asset.setId("asset-1");
        asset.setName("Detector");
        asset.setType("CV");
        asset.setRemark("detector model");
        asset.setOwnerUserId(7);
        asset.setDeleted(false);
        ModelUploadChunk chunk = new ModelUploadChunk();
        chunk.setUploadId(session.getId());
        chunk.setPartIndex(0);
        chunk.setObjectName("part-0");
        chunk.setSizeBytes(session.getFileSize());
        when(fixture.sessionRepo.findById(session.getId())).thenReturn(Optional.of(session));
        when(fixture.sessionRepo.updateStatusIfCurrent(any(), any(), any(), any(), any()))
                .thenReturn(1);
        when(fixture.assetRepo.findByIdAndDeletedFalseForUpdate(asset.getId()))
                .thenReturn(Optional.of(asset));
        when(fixture.chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId()))
                .thenReturn(List.of(chunk));
        when(fixture.versionRepo.existsByAssetIdAndVersion(asset.getId(), "v1"))
                .thenReturn(true);

        com.tss.platform.controller.v2.V2BusinessException error = assertThrows(
                com.tss.platform.controller.v2.V2BusinessException.class,
                () -> fixture.service.completeV2(session.getId())
        );

        assertEquals(org.springframework.http.HttpStatus.CONFLICT, error.getStatus());
        assertEquals("MODEL_VERSION_CONFLICT", error.getErrorCode());
    }

    @Test
    void inaccessibleTargetAssetReturnsSanitizedNotFoundError() {
        Fixture fixture = new Fixture();
        V2ModelUploadInitRequest request = fixture.request();
        request.setTargetAssetId("asset-secret");
        when(fixture.assetRepo.findByIdAndDeletedFalse("asset-secret"))
                .thenReturn(Optional.empty());

        com.tss.platform.controller.v2.V2BusinessException error = assertThrows(
                com.tss.platform.controller.v2.V2BusinessException.class,
                () -> fixture.service.initV2(request)
        );

        assertEquals(org.springframework.http.HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("MODEL_ASSET_NOT_FOUND", error.getErrorCode());
        assertEquals("模型资产不存在或无权访问", error.getMessage());
    }

    @Test
    void unknownUploadOnCompleteReturnsSanitizedNotFoundError() {
        Fixture fixture = new Fixture();
        when(fixture.sessionRepo.findById("upload-secret")).thenReturn(Optional.empty());

        com.tss.platform.controller.v2.V2BusinessException error = assertThrows(
                com.tss.platform.controller.v2.V2BusinessException.class,
                () -> fixture.service.completeV2("upload-secret")
        );

        assertEquals(org.springframework.http.HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("MODEL_UPLOAD_NOT_FOUND", error.getErrorCode());
        assertEquals("模型上传任务不存在或无权访问", error.getMessage());
    }

    private static byte[] zipBytes() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("model.onnx"));
            zip.write(new byte[]{1, 2, 3});
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    private static final class Fixture {
        private final MinioClient minioClient = mock(MinioClient.class);
        private final ModelUploadSessionRepository sessionRepo =
                mock(ModelUploadSessionRepository.class);
        private final ModelUploadChunkRepository chunkRepo =
                mock(ModelUploadChunkRepository.class);
        private final ModelAssetRepository assetRepo = mock(ModelAssetRepository.class);
        private final ModelVersionRepository versionRepo = mock(ModelVersionRepository.class);
        private final AuthContext authContext = mock(AuthContext.class);
        private final MinioDeleteTaskService deleteTaskService =
                mock(MinioDeleteTaskService.class);
        private final ModelUploadService service;

        private Fixture() {
            MinioConfig config = new MinioConfig();
            config.setBucket("models");
            when(authContext.currentUserId()).thenReturn(7);
            when(authContext.canAccessOwner(7)).thenReturn(true);
            service = new ModelUploadService(
                    minioClient,
                    config,
                    sessionRepo,
                    chunkRepo,
                    assetRepo,
                    versionRepo,
                    authContext,
                    deleteTaskService
            );
        }

        private V2ModelUploadInitRequest request() {
            V2ModelUploadInitRequest request = new V2ModelUploadInitRequest();
            request.setFileName("model.zip");
            request.setFileSize(128L);
            request.setFileFingerprint("sha256:abc");
            request.setModelName("Detector");
            request.setModelVersion("v1");
            request.setTaskType("CV");
            request.setRemark("detector model");
            return request;
        }

        private ModelUploadSession session() {
            ModelUploadSession session = new ModelUploadSession();
            session.setId("upload-1");
            session.setFileName("model.zip");
            session.setFileSize(128L);
            session.setFileFingerprint("sha256:abc");
            session.setChunkSize(5 * 1024 * 1024);
            session.setTotalChunks(1);
            session.setStatus("UPLOADING");
            session.setModelName("Detector");
            session.setModelVersion("v1");
            session.setTaskType("CV");
            session.setRemark("detector model");
            session.setOwnerUserId(7);
            session.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
            session.setUpdatedAt(session.getCreatedAt());
            return session;
        }
    }
}
