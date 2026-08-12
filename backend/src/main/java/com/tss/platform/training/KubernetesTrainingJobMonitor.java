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
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.time.Duration;
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
    private final TrainingFailureDiagnosticService failureDiagnosticService;

    public KubernetesTrainingJobMonitor(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            TrainingExperimentVersionRepository repository,
            ShellCommandRunner shellCommandRunner,
            TrainingRunSpecCodec runSpecCodec,
            TransactionTemplate transactionTemplate,
            @Lazy JobScheduler jobScheduler,
            TrainingFailureDiagnosticService failureDiagnosticService
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.repository = repository;
        this.shellCommandRunner = shellCommandRunner;
        this.runSpecCodec = runSpecCodec;
        this.transactionTemplate = transactionTemplate;
        this.jobScheduler = jobScheduler;
        this.failureDiagnosticService = failureDiagnosticService;
    }

    @Scheduled(fixedDelayString = "${training.kubernetes.monitor-interval-ms:30000}")
    public void syncJobStatuses() {
        if (!properties.isEnabled() || !environmentService.isKubernetesReady()) {
            return;
        }
        List<TrainingExperimentVersion> activeTasks = repository.findAllByOrderByCreatedAtDesc()
                .stream()
                // 只监控已提交 Job 的任务（scheduled=已分配节点待提交、running=运行中）。
                // queued（排队等节点）还没有 Job，由 JobScheduler.dispatchQueuedTasks 处理，不在这里监控。
                .filter(task -> "scheduled".equals(task.getStatus()) || "running".equals(task.getStatus()))
                .toList();

        for (TrainingExperimentVersion task : activeTasks) {
            syncSingleTask(task);
        }
        archiveRecentFailures();
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
            // Job 不存在或查询失败：scheduled 任务的 Job 可能还没提交（submitJob 在异步线程执行），
            // 不标记失败，等下一轮轮询再查。
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
            archiveFailure(task.getId(), jobName);
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

    private void archiveRecentFailures() {
        if (!properties.isFailureDiagnosticsEnabled()) {
            return;
        }
        int retryWindowSeconds = Math.max(60, properties.getFailureDiagnosticsRetryWindowSeconds());
        Instant cutoff = Instant.now().minus(Duration.ofSeconds(retryWindowSeconds));
        List<TrainingExperimentVersion> candidates = repository
                .findTop100ByStatusAndLogPathIsNullAndFinishedAtAfterAndServerIpIsNotNullOrderByFinishedAtAsc(
                        "failed",
                        cutoff
                );
        for (TrainingExperimentVersion candidate : candidates) {
            archiveFailure(candidate.getId(), KubernetesJobNaming.jobNameForTraining(candidate.getId()));
        }
    }

    private void archiveFailure(String trainingId, String jobName) {
        TrainingExperimentVersion task = null;
        TrainingFailureDiagnosticService.CaptureResult capture = null;
        try {
            task = repository.findById(trainingId).orElse(null);
            if (task == null || !"failed".equals(task.getStatus())
                    || (task.getLogPath() != null && !task.getLogPath().isBlank())) {
                return;
            }
            capture = failureDiagnosticService.archive(task, jobName);
            if (!capture.archived() || capture.logPath() == null) {
                return;
            }
            TrainingFailureDiagnosticService.CaptureResult archivedCapture = capture;
            Boolean attached = transactionTemplate.execute(tx -> repository.findById(trainingId)
                    .map(current -> {
                        if (archivedCapture.logPath().equals(current.getLogPath())) {
                            return true;
                        }
                        if (!"failed".equals(current.getStatus())
                                || (current.getLogPath() != null && !current.getLogPath().isBlank())) {
                            return false;
                        }
                        current.setLogPath(archivedCapture.logPath());
                        current.setUpdatedAt(Instant.now());
                        repository.save(current);
                        return true;
                    })
                    .orElse(false));
            if (!Boolean.TRUE.equals(attached)) {
                failureDiagnosticService.enqueueDeletion(task, capture.logPath());
            }
        } catch (Exception exception) {
            if (task != null && capture != null && capture.archived() && capture.logPath() != null) {
                try {
                    failureDiagnosticService.enqueueDeletion(task, capture.logPath());
                } catch (Exception cleanupException) {
                    LOG.warn("Failed to enqueue unattached K8s diagnostics: id={}, error={}",
                            trainingId, cleanupException.getMessage());
                }
            }
            LOG.warn("Failed to archive K8s training diagnostics: id={}, error={}",
                    trainingId, exception.getMessage());
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
