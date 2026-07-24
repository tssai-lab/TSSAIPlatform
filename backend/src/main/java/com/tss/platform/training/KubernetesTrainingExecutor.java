package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/** Submits one immutable RunSpec as one Kubernetes Job/Pod. */
@Component
public class KubernetesTrainingExecutor implements TrainingExecutor {

    private static final Logger LOG = LoggerFactory.getLogger(KubernetesTrainingExecutor.class);
    private static final Set<String> TERMINAL_STATUSES = Set.of("success", "failed", "stopped");

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final TrainingExperimentVersionRepository repository;
    private final KubernetesJobManifestBuilder manifestBuilder;
    private final ShellCommandRunner shellCommandRunner;
    private final TransactionTemplate transactionTemplate;

    @Value("${minio.access-key:}")
    private String minioAccessKey;

    @Value("${minio.secret-key:}")
    private String minioSecretKey;

    @Value("${minio.bucket:models}")
    private String minioBucket;

    public KubernetesTrainingExecutor(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            TrainingExperimentVersionRepository repository,
            KubernetesJobManifestBuilder manifestBuilder,
            ShellCommandRunner shellCommandRunner,
            TransactionTemplate transactionTemplate
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.repository = repository;
        this.manifestBuilder = manifestBuilder;
        this.shellCommandRunner = shellCommandRunner;
        this.transactionTemplate = transactionTemplate;
    }

    @Override
    public boolean isAvailable() {
        return properties.isEnabled() && environmentService.isKubernetesReady();
    }

    @Override
    public String getType() {
        return "kubernetes";
    }

    @Override
    public void start(String trainingId) {
        Thread thread = new Thread(() -> submitJob(trainingId), "k8s-training-submit-" + trainingId);
        thread.setDaemon(true);
        thread.start();
    }

    @Override
    public void stop(String trainingId) {
        String jobName = KubernetesJobNaming.jobNameForTraining(trainingId);
        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> deleteCmd = environmentService.kubectlCommand(
                kubeconfig, "delete", "job", jobName, "-n", properties.getNamespace(), "--ignore-not-found"
        );
        ShellCommandRunner.CommandResult result = shellCommandRunner.run(
                deleteCmd, environmentService.resolveProjectRoot(), 60
        );
        if (!result.success()) {
            LOG.warn("Failed to delete K8s Job: trainingId={}, error={}", trainingId, result.errorMessage());
        }
    }

    private void submitJob(String trainingId) {
        try {
            TrainingExperimentVersion task = repository.findById(trainingId)
                    .orElseThrow(() -> new IllegalArgumentException("training task does not exist: " + trainingId));
            String targetNode = task.getServerIp();
            String yaml = manifestBuilder.buildJobYaml(task, minioAccessKey, minioSecretKey, minioBucket, targetNode);
            Path kubeconfig = environmentService.resolveKubeconfig();
            List<String> applyCmd = environmentService.kubectlCommand(kubeconfig, "apply", "-f", "-");
            ShellCommandRunner.CommandResult result = runWithStdin(
                    applyCmd, environmentService.resolveProjectRoot(), yaml, 120
            );
            if (!result.success()) {
                throw new IllegalStateException("K8s Job submission failed: " + result.errorMessage() + "\n" + result.output());
            }
            updateStatus(trainingId, "queued", 0, null);
            LOG.info("K8s training Job submitted: trainingId={}, plan={}, job={}",
                    trainingId, task.getTrainingPlanId(), KubernetesJobNaming.jobNameForTraining(trainingId));
        } catch (Exception e) {
            LOG.error("K8s training Job submission failed: trainingId={}", trainingId, e);
            updateStatus(trainingId, "failed", 0, e.getMessage());
        }
    }

    private ShellCommandRunner.CommandResult runWithStdin(
            List<String> command, Path workingDirectory, String stdinContent, int timeoutSeconds
    ) {
        ProcessBuilder builder = new ProcessBuilder(command);
        if (workingDirectory != null) {
            builder.directory(workingDirectory.toFile());
        }
        builder.redirectErrorStream(true);
        try {
            Process process = builder.start();
            try (OutputStream outputStream = process.getOutputStream()) {
                outputStream.write(stdinContent.getBytes(StandardCharsets.UTF_8));
            }
            StringBuilder output = new StringBuilder();
            try (var reader = process.inputReader(StandardCharsets.UTF_8)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append('\n');
                }
            }
            boolean finished = process.waitFor(timeoutSeconds, java.util.concurrent.TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return ShellCommandRunner.CommandResult.failed(-1, output.toString(), "kubectl apply timed out");
            }
            int exitCode = process.exitValue();
            return exitCode == 0
                    ? ShellCommandRunner.CommandResult.success(output.toString())
                    : ShellCommandRunner.CommandResult.failed(exitCode, output.toString(), "kubectl apply failed exit=" + exitCode);
        } catch (Exception e) {
            return ShellCommandRunner.CommandResult.failed(-1, "", e.getMessage());
        }
    }

    private void updateStatus(String trainingId, String status, int progress, String errorMessage) {
        transactionTemplate.executeWithoutResult(tx -> repository.findById(trainingId).ifPresent(version -> {
            if (TERMINAL_STATUSES.contains(version.getStatus())) {
                return;
            }
            version.setStatus(status);
            version.setProgress(progress);
            version.setUpdatedAt(Instant.now());
            if (errorMessage != null) {
                version.setErrorMessage(errorMessage);
                version.setFinishedAt(Instant.now());
            }
            repository.save(version);
        }));
    }
}
