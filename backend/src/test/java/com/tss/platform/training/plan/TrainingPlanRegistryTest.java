package com.tss.platform.training.plan;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingPlanRegistryTest {

    @Test
    void loadsBothBuiltInPlansWithTheirDeclaredExecutionContracts() {
        TrainingPlanRegistry registry = new TrainingPlanRegistry(new TrainingPlanValidator());
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
    }
}
