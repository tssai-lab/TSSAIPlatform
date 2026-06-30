package com.tss.platform.inference;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.InferenceScriptVersionRepository;
import com.tss.platform.repository.InferenceTaskRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.service.InferenceTaskService;
import com.tss.platform.training.ShellCommandRunner;
import com.tss.platform.training.TrainingEnvironmentService;
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

@Component
public class KubernetesInferenceExecutor implements InferenceExecutor {

    private static final Logger LOG = LoggerFactory.getLogger(KubernetesInferenceExecutor.class);

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final InferenceTaskRepository taskRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final DatasetVersionRepository datasetVersionRepository;
    private final InferenceScriptVersionRepository scriptVersionRepository;
    private final KubernetesInferenceJobManifestBuilder manifestBuilder;
    private final ShellCommandRunner shellCommandRunner;
    private final TransactionTemplate transactionTemplate;

    @Value("${minio.access-key:}")
    private String minioAccessKey;

    @Value("${minio.secret-key:}")
    private String minioSecretKey;

    @Value("${minio.bucket:models}")
    private String minioBucket;

    public KubernetesInferenceExecutor(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            InferenceTaskRepository taskRepository,
            ModelVersionRepository modelVersionRepository,
            DatasetVersionRepository datasetVersionRepository,
            InferenceScriptVersionRepository scriptVersionRepository,
            KubernetesInferenceJobManifestBuilder manifestBuilder,
            ShellCommandRunner shellCommandRunner,
            TransactionTemplate transactionTemplate
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.taskRepository = taskRepository;
        this.modelVersionRepository = modelVersionRepository;
        this.datasetVersionRepository = datasetVersionRepository;
        this.scriptVersionRepository = scriptVersionRepository;
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
    public void start(String taskId) {
        Thread thread = new Thread(() -> submitJob(taskId), "k8s-inference-submit-" + taskId);
        thread.setDaemon(true);
        thread.start();
    }

    @Override
    public void stop(String taskId) {
        String jobName = KubernetesInferenceJobNaming.jobNameForInference(taskId);
        Path kubeconfig = environmentService.resolveKubeconfig();
        List<String> deleteCmd = environmentService.kubectlCommand(
                kubeconfig,
                "delete", "job", jobName,
                "-n", properties.getNamespace(),
                "--ignore-not-found"
        );
        ShellCommandRunner.CommandResult result = shellCommandRunner.run(
                deleteCmd,
                environmentService.resolveProjectRoot(),
                60
        );
        if (!result.success()) {
            LOG.warn("删除 K8s 推理 Job 失败: taskId={}, error={}", taskId, result.errorMessage());
        }
    }

    private void submitJob(String taskId) {
        updateStatus(taskId, "queued", 0, null);
        try {
            InferenceTask task = taskRepository.findById(taskId)
                    .orElseThrow(() -> new IllegalArgumentException("推理任务不存在: " + taskId));
            ModelVersion modelVersion = modelVersionRepository.findByIdAndDeletedFalse(task.getModelVersionId())
                    .orElseThrow(() -> new IllegalArgumentException("模型版本不存在: " + task.getModelVersionId()));
            InferenceScriptVersion scriptVersion = scriptVersionRepository.findByIdAndDeletedFalse(task.getScriptVersionId())
                    .orElseThrow(() -> new IllegalArgumentException("推理脚本版本不存在: " + task.getScriptVersionId()));
            DatasetVersion datasetVersion = null;
            if (InferenceTaskService.INPUT_MODE_DATASET_VERSION.equals(task.getInputMode())) {
                datasetVersion = datasetVersionRepository.findByIdAndDeletedFalse(task.getDatasetVersionId())
                        .orElseThrow(() -> new IllegalArgumentException("数据集版本不存在: " + task.getDatasetVersionId()));
            }

            String yaml = manifestBuilder.buildJobYaml(
                    task,
                    modelVersion,
                    scriptVersion,
                    datasetVersion,
                    minioAccessKey,
                    minioSecretKey,
                    minioBucket
            );

            Path kubeconfig = environmentService.resolveKubeconfig();
            List<String> applyCmd = environmentService.kubectlCommand(kubeconfig, "apply", "-f", "-");
            ShellCommandRunner.CommandResult result = runWithStdin(
                    applyCmd,
                    environmentService.resolveProjectRoot(),
                    yaml,
                    120
            );
            if (!result.success()) {
                throw new IllegalStateException("提交 K8s 推理 Job 失败: " + result.errorMessage() + "\n" + result.output());
            }
            LOG.info("K8s 推理 Job 已提交: taskId={}, job={}",
                    taskId, KubernetesInferenceJobNaming.jobNameForInference(taskId));
        } catch (Exception e) {
            LOG.error("K8s 推理 Job 提交失败: taskId={}", taskId, e);
            updateStatus(taskId, "failed", 0, e.getMessage());
        }
    }

    private ShellCommandRunner.CommandResult runWithStdin(
            List<String> command,
            Path workingDirectory,
            String stdinContent,
            int timeoutSeconds
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
                return ShellCommandRunner.CommandResult.failed(-1, output.toString(), "kubectl apply 超时");
            }
            int exitCode = process.exitValue();
            if (exitCode == 0) {
                return ShellCommandRunner.CommandResult.success(output.toString());
            }
            return ShellCommandRunner.CommandResult.failed(exitCode, output.toString(), "kubectl apply 失败 exit=" + exitCode);
        } catch (Exception e) {
            return ShellCommandRunner.CommandResult.failed(-1, "", e.getMessage());
        }
    }

    private void updateStatus(String taskId, String status, int progress, String errorMessage) {
        transactionTemplate.executeWithoutResult(tx -> taskRepository.findById(taskId).ifPresent(task -> {
            task.setStatus(status);
            task.setProgress(progress);
            task.setUpdatedAt(Instant.now());
            if (errorMessage != null) {
                task.setErrorMessage(errorMessage);
                task.setFinishedAt(Instant.now());
            }
            taskRepository.save(task);
        }));
    }
}
