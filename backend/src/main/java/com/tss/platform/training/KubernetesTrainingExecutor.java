package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
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
    private final KubernetesWorkloadClient workloadClient;
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
            KubernetesWorkloadClient workloadClient,
            TransactionTemplate transactionTemplate
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
        this.repository = repository;
        this.manifestBuilder = manifestBuilder;
        this.workloadClient = workloadClient;
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
        try {
            workloadClient.deleteTrainingJob(properties.getNamespace(), jobName);
        } catch (Exception e) {
            LOG.warn("Failed to delete K8s Job: trainingId={}, job={}", trainingId, jobName, e);
        }
    }

    private void submitJob(String trainingId) {
        try {
            TrainingExperimentVersion task = repository.findById(trainingId)
                    .orElseThrow(() -> new IllegalArgumentException("training task does not exist: " + trainingId));
            String yaml = manifestBuilder.buildJobYaml(task, minioAccessKey, minioSecretKey, minioBucket);
            workloadClient.applyTrainingJob(properties.getNamespace(), yaml);
            updateStatus(trainingId, "queued", 0, null);
            LOG.info("K8s training Job submitted: trainingId={}, plan={}, job={}",
                    trainingId, task.getTrainingPlanId(), KubernetesJobNaming.jobNameForTraining(trainingId));
        } catch (Exception e) {
            LOG.error("K8s training Job submission failed: trainingId={}", trainingId, e);
            updateStatus(trainingId, "failed", 0, e.getMessage());
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
