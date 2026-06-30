package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.MinioDeleteTaskService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ModelVersionCrudLifecycleTest {

    @Test
    void updateStatusAllowsDeprecatingModelVersion() {
        ModelVersionRepository versionRepo = mock(ModelVersionRepository.class);
        ModelAssetRepository assetRepo = mock(ModelAssetRepository.class);
        TrainingExperimentVersionRepository trainingRepo =
                mock(TrainingExperimentVersionRepository.class);
        AuthContext authContext = mock(AuthContext.class);
        ModelVersionCrudController controller = new ModelVersionCrudController(
                versionRepo,
                assetRepo,
                trainingRepo,
                mock(MinioDeleteTaskService.class),
                authContext
        );
        ModelVersion version = new ModelVersion();
        version.setId("model-ver-1");
        version.setAssetId("model-asset-1");
        version.setStatus("READY");
        version.setOwnerUserId(7);
        version.setPublishedAt(Instant.parse("2026-01-01T00:00:00Z"));
        ModelAsset asset = new ModelAsset();
        asset.setId("model-asset-1");
        asset.setOwnerUserId(7);
        when(versionRepo.findByIdAndDeletedFalse(version.getId()))
                .thenReturn(Optional.of(version));
        when(assetRepo.findByIdAndDeletedFalse(asset.getId()))
                .thenReturn(Optional.of(asset));
        when(authContext.canAccessOwner(7)).thenReturn(true);
        when(versionRepo.save(version)).thenReturn(version);

        ApiResponse<ModelVersion> response = controller.updateStatus(
                version.getId(),
                Map.of("status", "DEPRECATED")
        );

        assertTrue(response.isSuccess());
        assertEquals("DEPRECATED", response.getData().getStatus());
        verify(versionRepo).save(version);
    }
}
