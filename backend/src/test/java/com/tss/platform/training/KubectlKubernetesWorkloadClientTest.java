package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KubectlKubernetesWorkloadClientTest {

    private static final String NAMESPACE = "tss-training";
    private static final String JOB_NAME = "training-42";
    private static final String YAML = "apiVersion: batch/v1\nkind: Job\n";

    private final TrainingKubernetesProperties properties = new TrainingKubernetesProperties();
    private final TrainingEnvironmentService environmentService = mock(TrainingEnvironmentService.class);
    private final ShellCommandRunner shellCommandRunner = mock(ShellCommandRunner.class);
    private final Path kubeconfig = Path.of("test-kubeconfig");
    private final Path projectRoot = Path.of("project-root");
    private final List<String> applyCommand = List.of("kubectl", "apply");
    private final List<String> getCommand = List.of("kubectl", "get");
    private final List<String> deleteCommand = List.of("kubectl", "delete");

    private KubectlKubernetesWorkloadClient client;

    @BeforeEach
    void setUp() {
        properties.setNamespace(NAMESPACE);
        properties.setClientRequestTimeoutSeconds(37);
        when(environmentService.resolveKubeconfig()).thenReturn(kubeconfig);
        when(environmentService.resolveProjectRoot()).thenReturn(projectRoot);
        when(environmentService.kubectlCommand(kubeconfig, "apply", "-f", "-"))
                .thenReturn(applyCommand);
        when(environmentService.kubectlCommand(
                kubeconfig, "get", "job", JOB_NAME, "-n", NAMESPACE, "--ignore-not-found"))
                .thenReturn(getCommand);
        when(environmentService.kubectlCommand(
                kubeconfig, "delete", "job", JOB_NAME, "-n", NAMESPACE, "--ignore-not-found"))
                .thenReturn(deleteCommand);
        client = new KubectlKubernetesWorkloadClient(properties, environmentService, shellCommandRunner);
    }

    @Test
    void passesManifestUnchangedAndUsesConfiguredTimeout() {
        when(shellCommandRunner.runWithInput(applyCommand, projectRoot, YAML, 37))
                .thenReturn(ShellCommandRunner.CommandResult.success("created"));

        client.applyTrainingJob(NAMESPACE, JOB_NAME, YAML);

        verify(shellCommandRunner).runWithInput(applyCommand, projectRoot, YAML, 37);
        verify(shellCommandRunner, never()).run(getCommand, projectRoot, 30);
    }

    @Test
    void treatsFailedApplyAsSubmittedOnlyWhenTheSameJobExists() {
        when(shellCommandRunner.runWithInput(applyCommand, projectRoot, YAML, 37))
                .thenReturn(ShellCommandRunner.CommandResult.failed(-1, "timeout", "timed out"));
        when(shellCommandRunner.run(getCommand, projectRoot, 30))
                .thenReturn(ShellCommandRunner.CommandResult.success("job.batch/" + JOB_NAME));

        assertDoesNotThrow(() -> client.applyTrainingJob(NAMESPACE, JOB_NAME, YAML));
    }

    @Test
    void reportsFailedApplyWhenTheJobCannotBeConfirmed() {
        when(shellCommandRunner.runWithInput(applyCommand, projectRoot, YAML, 37))
                .thenReturn(ShellCommandRunner.CommandResult.failed(1, "denied", "apply failed"));
        when(shellCommandRunner.run(getCommand, projectRoot, 30))
                .thenReturn(ShellCommandRunner.CommandResult.success(""));

        assertThrows(
                KubernetesWorkloadException.class,
                () -> client.applyTrainingJob(NAMESPACE, JOB_NAME, YAML)
        );
    }

    @Test
    void rejectsAnotherNamespaceBeforeCallingKubectl() {
        assertThrows(
                IllegalArgumentException.class,
                () -> client.applyTrainingJob("other", JOB_NAME, YAML)
        );

        verify(shellCommandRunner, never()).runWithInput(applyCommand, projectRoot, YAML, 37);
    }

    @Test
    void deleteUsesIgnoreNotFoundAndReportsTimeout() {
        when(shellCommandRunner.run(deleteCommand, projectRoot, 60))
                .thenReturn(ShellCommandRunner.CommandResult.failed(-1, "", "timed out"));

        assertThrows(
                KubernetesWorkloadException.class,
                () -> client.deleteTrainingJob(NAMESPACE, JOB_NAME)
        );
        verify(shellCommandRunner).run(deleteCommand, projectRoot, 60);
    }
}
