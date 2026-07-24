package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.service.JobScheduler;
import com.tss.platform.service.TrainingModelPublishService;
import com.tss.platform.training.plan.TrainingPlanDefinition;
import com.tss.platform.training.plan.TrainingRunSpecCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;

@Component
public class KubernetesTrainingJobMonitor {

    private static final Logger LOG = LoggerFactory.getLogger(KubernetesTrainingJobMonitor.class);
    private static final Set<String> TERMINAL_STATUSES = Set.of("success", "failed", "stopped");

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final TrainingExperimentVersionRepository repository;
    private final ShellCommandRunner shellCommandRunner;
    private final TrainingRunSpecCodec runSpecCodec;
    private final TransactionTemplate transactionTemplate;
    private final JobScheduler jobScheduler;

    public KubernetesTrainingJobMonitor(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            TrainingExperimentVersionRepository repository,
            ShellCommandRunner shellCommandRunner,
            TrainingRunSpecCodec runSpecCodec,
            TransactionTemplate transactionTemplate,
            JobScheduler jobScheduler
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.repository = repository;
        this.shellCommandRunner = shellCommandRunner;
        this.runSpecCodec = runSpecCodec;
        this.transactionTemplate = transactionTemplate;
        this.jobScheduler = jobScheduler;
    }

    @Scheduled(fixedDelayString = "${training.kubernetes.monitor-interval-ms:30000}")
    public void syncJobStatuses() {
        if (!properties.isEnabled() || !environmentService.isKubernetesReady()) {
            return;
        }
        List<TrainingExperimentVersion> activeTasks = repository.findAllByOrderByCreatedAtDesc()
                .stream()
                .filter(task -> !TERMINAL_STATUSES.contains(task.getStatus()))
                .filter(task -> "queued".equals(task.getStatus()) || "running".equals(task.getStatus()))
                .toList();

        for (TrainingExperimentVersion task : activeTasks) {
            syncSingleTask(task);
        }
    }

    private void syncSingleTask(TrainingExperimentVersion task) {
        String jobName = KubernetesJobNaming.jobNameForTraining(task.getId());
        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> cmd = environmentService.kubectlCommand(
                kubeconfig,
                "get", "job", jobName,
                "-n", properties.getNamespace(),
                "-o", "jsonpath={.status.succeeded},{.status.failed},{.status.active}"
        );
        ShellCommandRunner.CommandResult result = shellCommandRunner.run(
                cmd,
                environmentService.resolveProjectRoot(),
                30
        );
        if (!result.success()) {
            if (result.output() != null && result.output().contains("NotFound")) {
                if ("queued".equals(task.getStatus())) {
                    markFailed(task.getId(), "K8s Job 不存在或尚未创建: " + jobName);
                }
            }
            return;
        }

        String[] parts = result.output().trim().split(",");
        int succeeded = parseInt(parts, 0);
        int failed = parseInt(parts, 1);
        int active = parseInt(parts, 2);

        if (succeeded > 0) {
            markSucceeded(task.getId());
            return;
        }
        if (failed > 0) {
            String podError = fetchPodFailureReason(jobName);
            markFailed(task.getId(), podError != null ? podError : "K8s Job 执行失败");
            return;
        }
        if (active > 0 && !"running".equals(task.getStatus())) {
            markRunning(task.getId());
        }
    }

    private String fetchPodFailureReason(String jobName) {
        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> cmd = environmentService.kubectlCommand(
                kubeconfig,
                "get", "pods",
                "-n", properties.getNamespace(),
                "-l", "job-name=" + jobName,
                "-o", "jsonpath={.items[0].status.containerStatuses[0].state.waiting.reason}"
        );
        ShellCommandRunner.CommandResult result = shellCommandRunner.run(
                cmd,
                environmentService.resolveProjectRoot(),
                20
        );
        if (result.success() && result.output() != null && !result.output().isBlank()) {
            return "Pod 状态: " + result.output().trim();
        }
        return null;
    }

    private int parseInt(String[] parts, int index) {
        if (parts.length <= index || parts[index] == null || parts[index].isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(parts[index].trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private void markRunning(String trainingId) {
        transactionTemplate.executeWithoutResult(tx -> repository.findById(trainingId).ifPresent(version -> {
            if (TERMINAL_STATUSES.contains(version.getStatus())) {
                return;
            }
            version.setStatus("running");
            version.setProgress(Math.max(version.getProgress() != null ? version.getProgress() : 0, 10));
            if (version.getStartedAt() == null) {
                version.setStartedAt(Instant.now());
            }
            version.setUpdatedAt(Instant.now());
            repository.save(version);
        }));
    }

    private void markSucceeded(String trainingId) {
        transactionTemplate.executeWithoutResult(tx -> repository.findById(trainingId).ifPresent(version -> {
            if (TERMINAL_STATUSES.contains(version.getStatus())) {
                return;
            }
            version.setStatus("success");
            version.setProgress(100);
            version.setFinishedAt(Instant.now());
            if (version.getProducedModelVersionId() == null
                    && version.getModelPublishStatus() == null) {
                if (version.getRunSpecJson() != null && !version.getRunSpecJson().isBlank()) {
                    String modelPath = runSpecCodec.decode(version).outputs().artifacts().stream()
                            .filter(artifact -> Boolean.TRUE.equals(artifact.publishAsModel()))
                            .map(TrainingPlanDefinition.Artifact::path)
                            .findFirst()
                            .orElseThrow(() -> new IllegalStateException("RunSpec has no publishable model artifact"));
                    version.setModelArtifactPath(
                            "training-results/" + version.getId() + "/artifacts/" + modelPath
                    );
                    version.setModelPublishStatus(TrainingModelPublishService.STATUS_PENDING);
                }
            }
            version.setUpdatedAt(Instant.now());
            repository.save(version);
            String nodeName = version.getServerIp();
            if (nodeName != null) {
                jobScheduler.releaseResources(trainingId, nodeName);
            }
            LOG.info("训练任务因 K8s Job 成功而同步为 success: id={}", trainingId);
        }));
    }

    private void markFailed(String trainingId, String errorMessage) {
        transactionTemplate.executeWithoutResult(tx -> repository.findById(trainingId).ifPresent(version -> {
            if (TERMINAL_STATUSES.contains(version.getStatus())) {
                return;
            }
            version.setStatus("failed");
            version.setProgress(version.getProgress() == null ? 0 : version.getProgress());
            version.setErrorMessage(errorMessage);
            version.setFinishedAt(Instant.now());
            version.setUpdatedAt(Instant.now());
            repository.save(version);
            String nodeName = version.getServerIp();
            if (nodeName != null) {
                jobScheduler.releaseResources(trainingId, nodeName);
            }
            LOG.warn("训练任务同步为 failed: id={}, reason={}", trainingId, errorMessage);
        }));
    }
}
