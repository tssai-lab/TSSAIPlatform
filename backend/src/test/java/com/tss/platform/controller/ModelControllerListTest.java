package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.MinioDeleteTaskService;
import com.tss.platform.service.ModelCodePreviewService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ModelControllerListTest {

    @Test
    void listUsesRepositoryPagingAndFilteringInsteadOfFullMemoryScan() {
        ModelAssetRepository assetRepo = mock(ModelAssetRepository.class);
        ModelVersionRepository versionRepo = mock(ModelVersionRepository.class);
        TrainingExperimentVersionRepository trainingRepo =
                mock(TrainingExperimentVersionRepository.class);
        MinioDeleteTaskService deleteTaskService = mock(MinioDeleteTaskService.class);
        ModelCodePreviewService codePreviewService = mock(ModelCodePreviewService.class);
        AuthContext authContext = mock(AuthContext.class);
        ModelController controller = new ModelController(
                assetRepo,
                versionRepo,
                trainingRepo,
                deleteTaskService,
                codePreviewService,
                authContext
        );
        ModelAsset asset = new ModelAsset();
        asset.setId("asset-1");
        asset.setName("Detector");
        asset.setType("CV");
        asset.setRemark("detector model");
        asset.setOwnerUserId(7);
        ModelVersion version = new ModelVersion();
        version.setId("model-ver-1");
        version.setAssetId(asset.getId());
        version.setVersion("v1");
        version.setFileName("detector.zip");
        version.setStatus("READY");
        version.setOwnerUserId(7);
        version.setCreatedAt(Instant.parse("2026-01-02T00:00:00Z"));

        when(authContext.isAdmin()).thenReturn(false);
        when(authContext.currentUserId()).thenReturn(7);
        when(versionRepo.searchVisibleCatalog(eq(7), eq("CV"), eq("%det%"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(
                        List.of(version),
                        PageRequest.of(0, 20),
                        37
                ));
        when(assetRepo.findAllById(any())).thenReturn(List.of(asset));

        ApiResponse<Map<String, Object>> response =
                controller.list("CV", " det ", 1, null, 20);

        assertTrue(response.isSuccess());
        Map<String, Object> payload = response.getData();
        assertEquals(37L, payload.get("total"));
        assertEquals(1, payload.get("page"));
        assertEquals(20, payload.get("pageSize"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data =
                (List<Map<String, Object>>) payload.get("data");
        assertEquals(1, data.size());
        assertEquals("model-ver-1", data.get(0).get("id"));
        assertEquals("Detector", data.get(0).get("name"));

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(versionRepo).searchVisibleCatalog(eq(7), eq("CV"), eq("%det%"), pageableCaptor.capture());
        assertEquals(0, pageableCaptor.getValue().getPageNumber());
        assertEquals(20, pageableCaptor.getValue().getPageSize());
        verify(versionRepo, never()).findByDeletedFalse();
        verify(assetRepo, never()).findByDeletedFalse();
        verify(assetRepo, never()).findByOwnerUserIdAndDeletedFalse(any());
    }
}
