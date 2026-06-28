package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
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

@Component
public class KubernetesTrainingExecutor implements TrainingExecutor {

    private static final Logger LOG = LoggerFactory.getLogger(KubernetesTrainingExecutor.class);

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final TrainingExperimentVersionRepository repository;
    private final CodeVersionRepository codeVersionRepository;
    private final DatasetVersionRepository datasetVersionRepository;
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
            CodeVersionRepository codeVersionRepository,
            DatasetVersionRepository datasetVersionRepository,
            KubernetesJobManifestBuilder manifestBuilder,
            ShellCommandRunner shellCommandRunner,
            TransactionTemplate transactionTemplate
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.repository = repository;
        this.codeVersionRepository = codeVersionRepository;
        this.datasetVersionRepository = datasetVersionRepository;
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
            LOG.warn("删除 K8s Job 失败: trainingId={}, error={}", trainingId, result.errorMessage());
        } else {
            LOG.info("已删除 K8s Job: {}", jobName);
        }
    }

    private void submitJob(String trainingId) {
        updateStatus(trainingId, "queued", 0, null);
        try {
            TrainingExperimentVersion task = repository.findById(trainingId)
                    .orElseThrow(() -> new IllegalArgumentException("训练任务不存在: " + trainingId));
            if (task.getTrainingProfile() == null || task.getTrainingProfile().isBlank()) {
                throw new IllegalStateException("当前 K8s 训练仅支持带 trainingProfile 的任务");
            }
            TrainingProfileRegistry.requireSupported(task.getTrainingProfile());

            CodeVersion codeVersion = codeVersionRepository.findByIdAndDeletedFalse(task.getCodeVersionId())
                    .orElseThrow(() -> new IllegalArgumentException("代码版本不存在: " + task.getCodeVersionId()));
            DatasetVersion datasetVersion = datasetVersionRepository.findByIdAndDeletedFalse(task.getDatasetVersionId())
                    .orElseThrow(() -> new IllegalArgumentException("数据集版本不存在"));

            String yaml = manifestBuilder.buildJobYaml(
                    task,
                    codeVersion,
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
                throw new IllegalStateException("提交 K8s Job 失败: " + result.errorMessage() + "\n" + result.output());
            }
            LOG.info("K8s 训练 Job 已提交: trainingId={}, profile={}, job={}",
                    trainingId, task.getTrainingProfile(), KubernetesJobNaming.jobNameForTraining(trainingId));
        } catch (Exception e) {
            LOG.error("K8s 训练 Job 提交失败: trainingId={}", trainingId, e);
            updateStatus(trainingId, "failed", 0, e.getMessage());
        }
    }

    private ShellCommandRunner.CommandResult runWithStdin(
            List<String> command,
            Path workingDirectory,
            String stdinContent,
            int timeoutSeconds
    ) {
        LOG.info("执行 kubectl apply: {}", command);
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

    private void updateStatus(String trainingId, String status, int progress, String errorMessage) {
        transactionTemplate.executeWithoutResult(tx -> repository.findById(trainingId).ifPresent(version -> {
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
