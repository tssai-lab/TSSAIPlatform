package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.List;

/** Existing kubectl behavior behind the common training Job control surface. */
@Component
@ConditionalOnProperty(
        prefix = "training.kubernetes",
        name = "client-mode",
        havingValue = "kubectl",
        matchIfMissing = true
)
public class KubectlKubernetesWorkloadClient implements KubernetesWorkloadClient {

    private static final Logger LOG = LoggerFactory.getLogger(KubectlKubernetesWorkloadClient.class);

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final ShellCommandRunner shellCommandRunner;

    public KubectlKubernetesWorkloadClient(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            ShellCommandRunner shellCommandRunner
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.shellCommandRunner = shellCommandRunner;
        LOG.info("Training Kubernetes workload client selected: kubectl");
    }

    @Override
    public void applyTrainingJob(String namespace, String jobName, String jobYaml) {
        validateTarget(namespace, jobName);
        if (jobYaml == null || jobYaml.isBlank()) {
            throw new IllegalArgumentException("training Job manifest is empty");
        }

        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> command = environmentService.kubectlCommand(kubeconfig, "apply", "-f", "-");
        ShellCommandRunner.CommandResult result = shellCommandRunner.runWithInput(
                command,
                environmentService.resolveProjectRoot(),
                jobYaml,
                properties.getClientRequestTimeoutSeconds()
        );
        if (result.success()) {
            return;
        }

        // A timeout or concurrent dispatch can leave the first request successful on the
        // API server. Reconcile by deterministic Job name with the same client only.
        if (trainingJobExists(namespace, jobName)) {
            LOG.info("Training Job already exists after kubectl apply failure; treating it as submitted: job={}", jobName);
            return;
        }
        throw new KubernetesWorkloadException(
                "kubectl training Job submission failed: " + result.errorMessage() + outputSuffix(result.output())
        );
    }

    @Override
    public boolean trainingJobExists(String namespace, String jobName) {
        validateTarget(namespace, jobName);
        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> command = environmentService.kubectlCommand(
                kubeconfig,
                "get", "job", jobName,
                "-n", namespace,
                "--ignore-not-found"
        );
        ShellCommandRunner.CommandResult result = shellCommandRunner.run(
                command,
                environmentService.resolveProjectRoot(),
                30
        );
        return result.success() && result.output() != null && !result.output().isBlank();
    }

    @Override
    public void deleteTrainingJob(String namespace, String jobName) {
        validateTarget(namespace, jobName);
        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> command = environmentService.kubectlCommand(
                kubeconfig,
                "delete", "job", jobName,
                "-n", namespace,
                "--ignore-not-found"
        );
        ShellCommandRunner.CommandResult result = shellCommandRunner.run(
                command,
                environmentService.resolveProjectRoot(),
                60
        );
        if (!result.success()) {
            throw new KubernetesWorkloadException(
                    "kubectl training Job deletion failed: " + result.errorMessage() + outputSuffix(result.output())
            );
        }
    }

    private void validateTarget(String namespace, String jobName) {
        if (namespace == null || !namespace.equals(properties.getNamespace())) {
            throw new IllegalArgumentException("training Job namespace is not the configured namespace");
        }
        if (jobName == null || jobName.isBlank()) {
            throw new IllegalArgumentException("training Job name is empty");
        }
    }

    private String outputSuffix(String output) {
        return output == null || output.isBlank() ? "" : "\n" + output;
    }
}
