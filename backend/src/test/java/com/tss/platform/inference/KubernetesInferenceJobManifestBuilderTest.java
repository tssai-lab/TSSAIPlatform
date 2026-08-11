package com.tss.platform.inference;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.ModelVersion;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class KubernetesInferenceJobManifestBuilderTest {

    @Test
    void manifestUsesAttemptScopedJobCallbackAndOutputPrefix() {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setInternalCallbackToken("internal-token");
        KubernetesInferenceJobManifestBuilder builder =
                new KubernetesInferenceJobManifestBuilder(properties);

        InferenceTask task = new InferenceTask();
        task.setId("infer-task-abc");
        task.setOwnerUserId(7);
        task.setCurrentAttempt(2);
        task.setModelVersionId("model-ver-1");
        task.setScriptVersionId("script-ver-1");
        task.setInputMode("SINGLE_OBJECT");
        task.setInputObjectName("users/7/files/input.jpg");
        task.setParamsJson("{}");

        ModelVersion modelVersion = new ModelVersion();
        modelVersion.setStoragePath("users/7/models/model.zip");

        InferenceScriptVersion scriptVersion = new InferenceScriptVersion();
        scriptVersion.setStoragePath("users/7/scripts/script.zip");
        scriptVersion.setEntryFile("infer.py");

        String yaml = builder.buildJobYaml(
                task,
                modelVersion,
                scriptVersion,
                null,
                "access",
                "secret",
                "models"
        );

        assertTrue(yaml.contains("name: tss-infer-infer-task-abc-a2"));
        assertTrue(yaml.contains("/api/internal/inference/result?id=infer-task-abc&attempt=2"));
        assertTrue(yaml.contains("name: INFERENCE_ATTEMPT"));
        assertTrue(yaml.contains("value: \"2\""));
        assertTrue(yaml.contains("users/7/inference-results/infer-task-abc/attempt-2"));
    }
}
