package com.tss.platform.inference;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import com.tss.platform.config.InferenceModelCacheProperties;
import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.ModelVersion;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KubernetesInferenceJobManifestBuilderTest {

    @Test
    void manifestUsesAttemptScopedJobCallbackAndOutputPrefix() {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setInternalCallbackToken("internal-token");
        KubernetesInferenceJobManifestBuilder builder =
                new KubernetesInferenceJobManifestBuilder(
                        properties, new InferenceModelCacheProperties());

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
        assertFalse(yaml.contains("model-cache-initializer"));
    }

    @Test
    void enabledCacheUsesAttestedDigestAndExposesOnlyRequestedModelReadOnly() throws Exception {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setInternalCallbackToken("internal-token");
        InferenceModelCacheProperties cacheProperties = new InferenceModelCacheProperties();
        cacheProperties.setEnabled(true);
        cacheProperties.setNodePath("/var/lib/tss-platform/model-cache");
        cacheProperties.setMountPath("/var/cache/tss/models");
        cacheProperties.setMaxBytes(1024);
        cacheProperties.setMinFreeBytes(128);
        KubernetesInferenceJobManifestBuilder builder =
                new KubernetesInferenceJobManifestBuilder(properties, cacheProperties);

        InferenceTask task = new InferenceTask();
        task.setId("infer-cache-1");
        task.setOwnerUserId(7);
        task.setCurrentAttempt(1);
        task.setModelVersionId("model-ver-1");
        task.setScriptVersionId("script-ver-1");
        task.setInputMode("SINGLE_OBJECT");
        task.setInputObjectName("users/7/files/input.jpg");
        task.setParamsJson("{}");

        String digest = "a".repeat(64);
        ModelVersion modelVersion = new ModelVersion();
        modelVersion.setId("model-ver-1");
        modelVersion.setStoragePath("users/7/models/model.zip");
        modelVersion.setSizeBytes(512L);
        modelVersion.setArtifactAttestedSha256(digest);

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

        assertTrue(yaml.contains("name: model-cache-initializer"));
        assertTrue(yaml.contains("path: \"/var/lib/tss-platform/model-cache\""));
        assertTrue(yaml.contains("value: \"prepare-model-cache\""));
        assertTrue(yaml.contains("value: \"" + digest + "\""));
        assertTrue(yaml.contains("subPath: \"entries/" + digest + "/data\""));
        assertTrue(yaml.contains("subPath: \"locks/" + digest + ".lock\""));
        assertTrue(yaml.contains("mountPath: /workspace/job/model"));
        assertTrue(yaml.contains("mountPath: /var/run/tss-model-cache/model.lock"));
        assertTrue(yaml.contains("readOnly: true"));
        assertTrue(yaml.contains("name: MODEL_CACHE_ENABLED"));

        JsonNode podSpec = YAMLMapper.builder().build().readTree(yaml)
                .path("spec").path("template").path("spec");
        assertEquals(1, podSpec.path("initContainers").size());
        assertEquals(1, podSpec.path("containers").size());
        assertEquals(2, podSpec.path("volumes").size());
        assertEquals(
                "Directory",
                podSpec.path("volumes").path(1).path("hostPath").path("type").asText());
    }

    @Test
    void enabledCacheRejectsUnsafeNodePath() {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setInternalCallbackToken("internal-token");
        InferenceModelCacheProperties cacheProperties = new InferenceModelCacheProperties();
        cacheProperties.setEnabled(true);
        cacheProperties.setNodePath("/var/lib/../etc");
        KubernetesInferenceJobManifestBuilder builder =
                new KubernetesInferenceJobManifestBuilder(properties, cacheProperties);

        InferenceTask task = new InferenceTask();
        task.setId("infer-cache-invalid");
        task.setOwnerUserId(7);
        task.setModelVersionId("model-ver-1");
        task.setScriptVersionId("script-ver-1");
        task.setInputMode("SINGLE_OBJECT");

        ModelVersion modelVersion = new ModelVersion();
        modelVersion.setId("model-ver-1");
        modelVersion.setStoragePath("users/7/models/model.zip");
        modelVersion.setSizeBytes(512L);
        modelVersion.setArtifactAttestedSha256("b".repeat(64));

        InferenceScriptVersion scriptVersion = new InferenceScriptVersion();
        scriptVersion.setStoragePath("users/7/scripts/script.zip");
        scriptVersion.setEntryFile("infer.py");

        assertThrows(
                IllegalStateException.class,
                () -> builder.buildJobYaml(
                        task, modelVersion, scriptVersion, null, "access", "secret", "models")
        );
    }
}
