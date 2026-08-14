package com.tss.platform.training.plan;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.asset.spec.ArtifactSpecRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingPlanRegistryTest {

    @Test
    void loadsBuiltInPlansWithTheirDeclaredExecutionContracts() {
        TrainingPlanRegistry registry = new TrainingPlanRegistry(
                new TrainingPlanValidator(new ArtifactSpecRegistry()),
                new TrainingPlanYamlParser()
        );
        registry.initialize();

        TrainingPlanDefinition yolo = registry.requireEnabled("yolo_object_detection", "v1");
        assertEquals("train.py", yolo.execution().entrypoint());
        assertTrue(yolo.trainingModes().contains(TrainingPlanDefinition.TrainingMode.FULL_FINETUNE));
        assertEquals("best.pt", yolo.outputs().artifacts().stream()
                .filter(artifact -> Boolean.TRUE.equals(artifact.publishAsModel()))
                .findFirst().orElseThrow().path());

        TrainingPlanDefinition baseline = registry.requireEnabled(
                "image_text_consistency_fusion_logreg", "v1"
        );
        assertEquals("scripts/training/train_fusion_baseline.py", baseline.execution().entrypoint());

        TrainingPlanDefinition huggingFace = registry.requireEnabled(
                "hf_image_classification", "v1"
        );
        assertEquals("train.py", huggingFace.execution().entrypoint());
        assertEquals("mobilenet_beans_model.zip", huggingFace.outputs().artifacts().stream()
                .filter(artifact -> Boolean.TRUE.equals(artifact.publishAsModel()))
                .findFirst().orElseThrow().path());
        assertTrue(huggingFace.inputs().dataset().annotationFormats().contains("FOLDER_CLASSIFICATION"));
    }

    @Test
    void additiveV2FieldsDoNotChangeSerializedV1ApiShape() throws Exception {
        TrainingPlanRegistry registry = new TrainingPlanRegistry(
                new TrainingPlanValidator(new ArtifactSpecRegistry()),
                new TrainingPlanYamlParser()
        );
        registry.initialize();

        String json = new ObjectMapper().writeValueAsString(
                registry.requireEnabled("hf_image_classification", "v1")
        );

        assertTrue(!json.contains("\"category\""));
        assertTrue(!json.contains("\"acceptedSpecIds\""));
        assertTrue(!json.contains("\"publishedModelSpecId\""));
    }
}
