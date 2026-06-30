package com.tss.platform.inference;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.repository.InferenceTaskRepository;
import com.tss.platform.training.TrainingEnvironmentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;

@Service
public class InferenceExecutorRouter implements InferenceExecutor {

    private static final Logger LOG = LoggerFactory.getLogger(InferenceExecutorRouter.class);

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final KubernetesInferenceExecutor kubernetesInferenceExecutor;
    private final InferenceTaskRepository taskRepository;
    private final TransactionTemplate transactionTemplate;

    public InferenceExecutorRouter(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            KubernetesInferenceExecutor kubernetesInferenceExecutor,
            InferenceTaskRepository taskRepository,
            TransactionTemplate transactionTemplate
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.kubernetesInferenceExecutor = kubernetesInferenceExecutor;
        this.taskRepository = taskRepository;
        this.transactionTemplate = transactionTemplate;
    }

    @Override
    public boolean isAvailable() {
        return properties.isEnabled() && environmentService.isKubernetesReady();
    }

    @Override
    public String getType() {
        return "router";
    }

    @Override
    public void start(String taskId) {
        if (!isAvailable()) {
            LOG.warn("K8s 推理环境不可用: taskId={}", taskId);
            markFailed(taskId, "K8s 推理环境不可用，无法执行推理任务");
            return;
        }
        LOG.info("启动推理: taskId={}, executor={}", taskId, kubernetesInferenceExecutor.getType());
        kubernetesInferenceExecutor.start(taskId);
    }

    @Override
    public void stop(String taskId) {
        if (!properties.isEnabled()) {
            return;
        }
        kubernetesInferenceExecutor.stop(taskId);
    }

    private void markFailed(String taskId, String message) {
        transactionTemplate.executeWithoutResult(tx -> taskRepository.findById(taskId).ifPresent(task -> {
            task.setStatus("failed");
            task.setProgress(0);
            task.setErrorMessage(message);
            task.setFinishedAt(Instant.now());
            task.setUpdatedAt(Instant.now());
            taskRepository.save(task);
        }));
    }
}
