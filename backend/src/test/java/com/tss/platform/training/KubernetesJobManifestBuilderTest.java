package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.training.plan.TrainingPlanDefinition;
import com.tss.platform.training.plan.TrainingRunSpec;
import com.tss.platform.training.plan.TrainingRunSpecCodec;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class KubernetesJobManifestBuilderTest {

    @Test
    void containerStartsAtWorkspaceRootSoNonRootWorkerCanCreateCodeDirectory() {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setInternalCallbackToken("test-callback-token");

        TrainingExperimentVersion task = mock(TrainingExperimentVersion.class);
        when(task.getId()).thenReturn("train-version-test");
        when(task.getRunSpecJson()).thenReturn("{}");
        when(task.getRunSpecSha256()).thenReturn("a".repeat(64));

        TrainingRunSpec runSpec = mock(TrainingRunSpec.class);
        TrainingPlanDefinition.Security security = mock(TrainingPlanDefinition.Security.class);
        TrainingRunSpec.Resources resources = mock(TrainingRunSpec.Resources.class);
        TrainingRunSpec.Runtime runtime = mock(TrainingRunSpec.Runtime.class);
        when(runSpec.security()).thenReturn(security);
        when(security.maxRuntimeSeconds()).thenReturn(3600);
        when(security.runAsNonRoot()).thenReturn(true);
        when(security.allowPrivilegeEscalation()).thenReturn(false);
        when(runSpec.resources()).thenReturn(resources);
        when(resources.nodeSelector()).thenReturn(Map.of());
        when(resources.ephemeralStorageLimit()).thenReturn("1Gi");
        when(resources.cpuRequest()).thenReturn("1");
        when(resources.cpuLimit()).thenReturn("2");
        when(resources.memoryRequest()).thenReturn("1Gi");
        when(resources.memoryLimit()).thenReturn("2Gi");
        when(resources.gpuCount()).thenReturn(0);
        when(runSpec.runtime()).thenReturn(runtime);
        when(runtime.imagePullPolicy()).thenReturn(TrainingPlanDefinition.ImagePullPolicy.IfNotPresent);

        TrainingRunSpecCodec codec = mock(TrainingRunSpecCodec.class);
        when(codec.decode(task)).thenReturn(runSpec);
        TrainingRuntimeImageService runtimeImageService = mock(TrainingRuntimeImageService.class);
        when(runtimeImageService.resolveImage(runSpec)).thenReturn("registry.example/training-worker:test");

        String yaml = new KubernetesJobManifestBuilder(properties, codec, runtimeImageService)
                .buildJobYaml(task, "access", "secret", "models", null);

        assertTrue(yaml.contains("workingDir: /workspace/job\n"));
        assertFalse(yaml.contains("workingDir: /workspace/job/code\n"));
    }
}
