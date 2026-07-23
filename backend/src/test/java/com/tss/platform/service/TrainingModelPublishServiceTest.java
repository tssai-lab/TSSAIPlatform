package com.tss.platform.service;

import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.training.plan.TrainingPlanDefinition;
import com.tss.platform.training.plan.TrainingRunSpec;
import com.tss.platform.training.plan.TrainingRunSpecCodec;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TrainingModelPublishServiceTest {

    @Test
    void publishedRunSpecModelBecomesTheAssetsCurrentVersion() {
        TrainingExperimentVersionRepository trainingRepo = mock(TrainingExperimentVersionRepository.class);
        ModelAssetRepository assetRepo = mock(ModelAssetRepository.class);
        ModelVersionRepository versionRepo = mock(ModelVersionRepository.class);
        TrainingExperimentVersion training = new TrainingExperimentVersion();
        training.setId("training-1");
        training.setExperimentId("experiment-1");
        training.setVersionNo(1);
        training.setName("beans");
        training.setDatasetVersionId("dataset-1");
        training.setCodeVersionId("code-1");
        training.setOwnerUserId(7);
        training.setModelPublishStatus(TrainingModelPublishService.STATUS_PUBLISHING);
        when(trainingRepo.findById("training-1")).thenReturn(Optional.of(training));
        when(assetRepo.findById("asset-1")).thenReturn(Optional.empty());
        when(assetRepo.saveAndFlush(any(ModelAsset.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(versionRepo.findById("model-version-1")).thenReturn(Optional.empty());
        when(versionRepo.existsByAssetIdAndVersion("asset-1", "v1")).thenReturn(false);

        TrainingRunSpec runSpec = mock(TrainingRunSpec.class);
        when(runSpec.plan()).thenReturn(new TrainingRunSpec.PlanRef("hf_image_classification", "v1"));
        TrainingPlanDefinition.Artifact contract = new TrainingPlanDefinition.Artifact(
                "model.zip",
                TrainingPlanDefinition.ArtifactRole.PRIMARY_MODEL,
                true,
                "HF_MODEL_ARCHIVE",
                true
        );
        ArtifactDigestService.DigestResult digest =
                new ArtifactDigestService.DigestResult("a".repeat(64), 1234L);
        TrainingModelPublishService service = new TrainingModelPublishService(
                trainingRepo,
                assetRepo,
                versionRepo,
                mock(MinioService.class),
                mock(ArtifactDigestService.class),
                mock(TrainingRunSpecCodec.class),
                mock(PlatformTransactionManager.class)
        );

        ReflectionTestUtils.invokeMethod(
                service,
                "persistPublishedRunSpecModel",
                "training-1",
                runSpec,
                contract,
                digest,
                "asset-1",
                "model-version-1",
                "v1",
                "users/7/models/asset-1/v1/model.zip",
                1234L,
                "model.zip",
                "CV"
        );

        ArgumentCaptor<ModelAsset> assetCaptor = ArgumentCaptor.forClass(ModelAsset.class);
        verify(assetRepo, atLeastOnce()).saveAndFlush(assetCaptor.capture());
        assertEquals("model-version-1", assetCaptor.getValue().getCurrentVersionId());
        assertEquals("model-version-1", training.getProducedModelVersionId());
        assertEquals(TrainingModelPublishService.STATUS_PUBLISHED, training.getModelPublishStatus());
    }
}
