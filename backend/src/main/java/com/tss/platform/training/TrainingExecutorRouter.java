package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TrainingExecutorRouter implements TrainingExecutor {

    private static final Logger LOG = LoggerFactory.getLogger(TrainingExecutorRouter.class);

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;
    private final KubernetesTrainingExecutor kubernetesTrainingExecutor;
    private final LocalTrainingExecutor localTrainingExecutor;

    public TrainingExecutorRouter(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService,
            KubernetesTrainingExecutor kubernetesTrainingExecutor,
            LocalTrainingExecutor localTrainingExecutor
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.kubernetesTrainingExecutor = kubernetesTrainingExecutor;
        this.localTrainingExecutor = localTrainingExecutor;
    }

    @Override
    public boolean isAvailable() {
        return resolveExecutor().isAvailable();
    }

    @Override
    public String getType() {
        return resolveExecutor().getType();
    }

    @Override
    public void start(String trainingId) {
        TrainingExecutor executor = resolveExecutor();
        LOG.info("启动训练: trainingId={}, executor={}", trainingId, executor.getType());
        executor.start(trainingId);
    }

    @Override
    public void stop(String trainingId) {
        TrainingExecutor executor = resolveExecutorForStop();
        LOG.info("停止训练: trainingId={}, executor={}", trainingId, executor.getType());
        executor.stop(trainingId);
    }

    /** 停止时优先尝试 K8s（任务可能由 K8s 提交） */
    private TrainingExecutor resolveExecutorForStop() {
        if (properties.isEnabled()) {
            return kubernetesTrainingExecutor;
        }
        return localTrainingExecutor;
    }

    private TrainingExecutor resolveExecutor() {
        if (properties.isEnabled() && environmentService.isKubernetesReady()) {
            return kubernetesTrainingExecutor;
        }
        if (properties.isFallbackToLocal()) {
            LOG.warn("K8s 训练环境不可用，回退本地训练");
            return localTrainingExecutor;
        }
        throw new IllegalStateException("K8s 训练环境不可用且未启用 fallback");
    }
}
