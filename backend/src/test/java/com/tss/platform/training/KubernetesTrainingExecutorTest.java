package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class KubernetesTrainingExecutorTest {

    @Test
    void stopDelegatesOnlyTheExpectedJobToTheWorkloadClient() {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setNamespace("tss-training");
        KubernetesWorkloadClient workloadClient = mock(KubernetesWorkloadClient.class);
        KubernetesTrainingExecutor executor = new KubernetesTrainingExecutor(
                properties,
                mock(TrainingEnvironmentService.class),
                mock(TrainingExperimentVersionRepository.class),
                mock(KubernetesJobManifestBuilder.class),
                workloadClient,
                mock(TransactionTemplate.class)
        );

        executor.stop("training-42");

        verify(workloadClient).deleteTrainingJob(
                "tss-training",
                KubernetesJobNaming.jobNameForTraining("training-42")
        );
    }

    @Test
    void fabric8ClientRefusesToFallBackToAnImplicitKubeconfig() {
        TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
        properties.setNamespace("tss-training");
        TrainingEnvironmentService environmentService = mock(TrainingEnvironmentService.class);
        when(environmentService.resolveKubeconfig())
                .thenReturn(Path.of("target", "does-not-exist", "training-kubeconfig"));
        Fabric8KubernetesWorkloadClient client = new Fabric8KubernetesWorkloadClient(properties, environmentService);

        assertThrows(IllegalStateException.class,
                () -> client.deleteTrainingJob("tss-training", "training-42"));
    }
}
