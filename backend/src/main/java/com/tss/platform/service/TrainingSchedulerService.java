package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.TrainingCallbackProperties;
import com.tss.platform.config.TrainingK8sProperties;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ModelVersionRepository;
import io.fabric8.kubernetes.api.model.ContainerBuilder;
import io.fabric8.kubernetes.api.model.EnvVar;
import io.fabric8.kubernetes.api.model.EnvVarBuilder;
import io.fabric8.kubernetes.api.model.Quantity;
import io.fabric8.kubernetes.api.model.ResourceRequirementsBuilder;
import io.fabric8.kubernetes.api.model.batch.v1.Job;
import io.fabric8.kubernetes.api.model.batch.v1.JobBuilder;
import io.fabric8.kubernetes.api.model.batch.v1.JobStatus;
import io.fabric8.kubernetes.client.KubernetesClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class TrainingSchedulerService {
    private static final String STATUS_QUEUED = "queued";
    private static final String STATUS_RUNNING = "running";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final String STATUS_STOPPED = "stopped";

    private final TrainingK8sProperties k8sProperties;
    private final TrainingCallbackProperties callbackProperties;
    private final KubernetesClientFactory kubernetesClientFactory;
    private final ModelVersionRepository modelVersionRepository;
    private final DatasetVersionRepository datasetVersionRepository;
    private final ObjectMapper objectMapper;

    @Value("${minio.endpoint}")
    private String minioEndpoint;
    @Value("${minio.access-key}")
    private String minioAccessKey;
    @Value("${minio.secret-key}")
    private String minioSecretKey;
    @Value("${minio.bucket}")
    private String minioBucket;

    public TrainingSchedulerService(
            TrainingK8sProperties k8sProperties,
            TrainingCallbackProperties callbackProperties,
            KubernetesClientFactory kubernetesClientFactory,
            ModelVersionRepository modelVersionRepository,
            DatasetVersionRepository datasetVersionRepository,
            ObjectMapper objectMapper
    ) {
        this.k8sProperties = k8sProperties;
        this.callbackProperties = callbackProperties;
        this.kubernetesClientFactory = kubernetesClientFactory;
        this.modelVersionRepository = modelVersionRepository;
        this.datasetVersionRepository = datasetVersionRepository;
        this.objectMapper = objectMapper;
    }

    public TrainingScheduleResult submitTrainingJob(TrainingExperimentVersion version) {
        if (!k8sProperties.isEnabled()) {
            return new TrainingScheduleResult("local-" + version.getId(), "local", true, null);
        }
        String namespace = k8sProperties.getNamespace();
        String jobName = toJobName(version.getId());
        String callbackUrl = callbackProperties.getBaseUrl().replaceAll("/+$", "")
                + "/api/internal/training/result";

        ModelVersion modelVersion = modelVersionRepository.findById(version.getModelVersionId())
                .orElseThrow(() -> new IllegalArgumentException("模型版本不存在: " + version.getModelVersionId()));
        DatasetVersion datasetVersion = datasetVersionRepository.findById(version.getDatasetVersionId())
                .orElseThrow(() -> new IllegalArgumentException("数据集版本不存在: " + version.getDatasetVersionId()));

        List<EnvVar> envVars = new ArrayList<>();
        envVars.add(env("TRAINING_ID", version.getId()));
        envVars.add(env("EXPERIMENT_ID", version.getExperimentId()));
        envVars.add(env("MODEL_VERSION_ID", version.getModelVersionId()));
        envVars.add(env("DATASET_VERSION_ID", version.getDatasetVersionId()));
        envVars.add(env("HYPER_PARAMS_JSON", normalizeJson(version.getHyperParamsJson())));
        envVars.add(env("MINIO_ENDPOINT", minioEndpoint));
        envVars.add(env("MINIO_ACCESS_KEY", minioAccessKey));
        envVars.add(env("MINIO_SECRET_KEY", minioSecretKey));
        envVars.add(env("MINIO_BUCKET", minioBucket));
        envVars.add(env("MODEL_STORAGE_PATH", nullToEmpty(modelVersion.getStoragePath())));
        envVars.add(env("DATASET_STORAGE_PATH", nullToEmpty(datasetVersion.getStoragePath())));
        envVars.add(env("CALLBACK_URL", callbackUrl));
        envVars.add(env("CALLBACK_TOKEN", callbackProperties.getToken()));
        envVars.add(env("DEFAULT_EPOCHS", "1"));
        envVars.add(env("DEFAULT_IMGSZ", "320"));
        envVars.add(env("DEFAULT_BATCH", "2"));
        envVars.add(env("DEFAULT_DEVICE", "cpu"));
        envVars.add(env("SUBMITTED_AT", Instant.now().toString()));

        Job job = new JobBuilder()
                .withNewMetadata()
                .withName(jobName)
                .withNamespace(namespace)
                .addToLabels("app", "tss-training")
                .addToLabels("training-id", version.getId())
                .addToLabels("experiment-id", version.getExperimentId())
                .endMetadata()
                .withNewSpec()
                .withBackoffLimit(0)
                .withTtlSecondsAfterFinished(3600)
                .withNewTemplate()
                .withNewMetadata()
                .addToLabels("app", "tss-training")
                .addToLabels("training-id", version.getId())
                .endMetadata()
                .withNewSpec()
                .withRestartPolicy("Never")
                .withContainers(new ContainerBuilder()
                        .withName("trainer")
                        .withImage(k8sProperties.getImage())
                        .withImagePullPolicy(k8sProperties.getPullPolicy())
                        .withEnv(envVars)
                        .withResources(new ResourceRequirementsBuilder()
                                .addToRequests("cpu", new Quantity(k8sProperties.getCpuRequest()))
                                .addToRequests("memory", new Quantity(k8sProperties.getMemoryRequest()))
                                .addToLimits("cpu", new Quantity(k8sProperties.getCpuRequest()))
                                .addToLimits("memory", new Quantity(k8sProperties.getMemoryRequest()))
                                .build())
                        .build())
                .endSpec()
                .endTemplate()
                .endSpec()
                .build();

        try (KubernetesClient client = kubernetesClientFactory.createClient()) {
            client.namespaces().withName(namespace).createOrReplace();
            client.batch().v1().jobs().inNamespace(namespace).resource(job).createOrReplace();
            return new TrainingScheduleResult(jobName, namespace, true, null);
        } catch (Exception e) {
            return new TrainingScheduleResult(jobName, namespace, false, "创建 K8s Job 失败: " + e.getMessage());
        }
    }

    public boolean stopTrainingJob(String namespace, String jobName) {
        if (!k8sProperties.isEnabled() || jobName == null || jobName.isBlank()) {
            return false;
        }
        String ns = namespace == null || namespace.isBlank() ? k8sProperties.getNamespace() : namespace;
        try (KubernetesClient client = kubernetesClientFactory.createClient()) {
            return client.batch().v1().jobs().inNamespace(ns).withName(jobName).delete().size() > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    public Optional<TrainingRuntimeStatus> getRuntimeStatus(String namespace, String jobName) {
        if (!k8sProperties.isEnabled() || jobName == null || jobName.isBlank()) {
            return Optional.empty();
        }
        String ns = namespace == null || namespace.isBlank() ? k8sProperties.getNamespace() : namespace;
        try (KubernetesClient client = kubernetesClientFactory.createClient()) {
            Job job = client.batch().v1().jobs().inNamespace(ns).withName(jobName).get();
            if (job == null) {
                return Optional.of(new TrainingRuntimeStatus(STATUS_STOPPED, 0, "job-not-found"));
            }
            JobStatus status = job.getStatus();
            if (status == null) {
                return Optional.of(new TrainingRuntimeStatus(STATUS_QUEUED, 0, "pending"));
            }
            Integer succeeded = valueOrZero(status.getSucceeded());
            Integer failed = valueOrZero(status.getFailed());
            Integer active = valueOrZero(status.getActive());
            if (succeeded > 0) {
                return Optional.of(new TrainingRuntimeStatus(STATUS_SUCCESS, 100, "succeeded"));
            }
            if (failed > 0) {
                return Optional.of(new TrainingRuntimeStatus(STATUS_FAILED, 0, "failed"));
            }
            if (active > 0) {
                return Optional.of(new TrainingRuntimeStatus(STATUS_RUNNING, 50, "active"));
            }
            return Optional.of(new TrainingRuntimeStatus(STATUS_QUEUED, 0, "queued"));
        } catch (Exception e) {
            return Optional.of(new TrainingRuntimeStatus(STATUS_FAILED, 0, e.getMessage()));
        }
    }

    public K8sClusterStatus getClusterStatus() {
        if (!k8sProperties.isEnabled()) {
            return new K8sClusterStatus(false, "training.k8s.enabled=false", null, null, 0);
        }
        try (KubernetesClient client = kubernetesClientFactory.createClient()) {
            int readyNodes = client.nodes().list().getItems().stream().map(node -> node.getStatus())
                    .filter(s -> s != null && s.getConditions() != null)
                    .mapToInt(s -> (int) s.getConditions().stream()
                            .filter(c -> "Ready".equals(c.getType()) && "True".equalsIgnoreCase(c.getStatus()))
                            .count())
                    .sum();
            client.namespaces().withName(k8sProperties.getNamespace()).createOrReplace();
            return new K8sClusterStatus(
                    true,
                    "ok",
                    k8sProperties.getNamespace(),
                    k8sProperties.getImage(),
                    readyNodes
            );
        } catch (Exception e) {
            return new K8sClusterStatus(false, e.getMessage(), k8sProperties.getNamespace(), k8sProperties.getImage(), 0);
        }
    }

    private String normalizeJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return "{}";
        }
        try {
            Map<?, ?> map = objectMapper.readValue(raw, Map.class);
            return objectMapper.writeValueAsString(map);
        } catch (Exception ignored) {
            return raw;
        }
    }

    private int valueOrZero(Integer value) {
        return value == null ? 0 : value;
    }

    private EnvVar env(String key, String value) {
        return new EnvVarBuilder().withName(key).withValue(value).build();
    }

    private String toJobName(String taskId) {
        String suffix = taskId == null ? "unknown" : taskId.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]", "-");
        if (suffix.length() > 40) {
            suffix = suffix.substring(0, 40);
        }
        return "train-" + suffix;
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    public record TrainingScheduleResult(
            String jobName,
            String namespace,
            boolean submitted,
            String errorMessage
    ) {
    }

    public record TrainingRuntimeStatus(
            String status,
            Integer progress,
            String reason
    ) {
    }

    public record K8sClusterStatus(
            boolean ready,
            String message,
            String namespace,
            String image,
            int readyNodes
    ) {
    }
}
