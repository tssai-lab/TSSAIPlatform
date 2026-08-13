package com.tss.platform.inference;

import com.tss.platform.config.InferenceModelCacheProperties;
import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.service.JobTtlPolicyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.regex.Pattern;

@Component
public class KubernetesInferenceJobManifestBuilder {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(KubernetesInferenceJobManifestBuilder.class);
    private static final Pattern SHA256_PATTERN = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern LINUX_ABSOLUTE_PATH = Pattern.compile("/[A-Za-z0-9._/-]+");

    private final TrainingKubernetesProperties properties;
    private final InferenceModelCacheProperties modelCacheProperties;
    private JobTtlPolicyService jobTtlPolicyService;

    @Value("${inference.kubernetes.worker-image:tss-inference-worker:local}")
    private String workerImage;

    @Value("${inference.kubernetes.worker-image-pull-policy:IfNotPresent}")
    private String workerImagePullPolicy;

    @Value("${inference.kubernetes.cpu-request:500m}")
    private String cpuRequest;

    @Value("${inference.kubernetes.cpu-limit:2}")
    private String cpuLimit;

    @Value("${inference.kubernetes.memory-request:512Mi}")
    private String memoryRequest;

    @Value("${inference.kubernetes.memory-limit:4Gi}")
    private String memoryLimit;

    @Value("${inference.kubernetes.ephemeral-storage-request:2Gi}")
    private String ephemeralStorageRequest;

    @Value("${inference.kubernetes.ephemeral-storage-limit:12Gi}")
    private String ephemeralStorageLimit;

    public KubernetesInferenceJobManifestBuilder(
            TrainingKubernetesProperties properties,
            InferenceModelCacheProperties modelCacheProperties
    ) {
        this.properties = properties;
        this.modelCacheProperties = modelCacheProperties;
    }

    @Autowired
    void setJobTtlPolicyService(JobTtlPolicyService jobTtlPolicyService) {
        this.jobTtlPolicyService = jobTtlPolicyService;
    }
    public String buildJobYaml(
            InferenceTask task,
            ModelVersion modelVersion,
            InferenceScriptVersion scriptVersion,
            DatasetVersion datasetVersion,
            String minioAccessKey,
            String minioSecretKey,
            String minioBucket
    ) {
        return buildJobYaml(
                task, modelVersion, scriptVersion, datasetVersion,
                minioAccessKey, minioSecretKey, minioBucket, null
        );
    }

    public String buildJobYaml(
            InferenceTask task,
            ModelVersion modelVersion,
            InferenceScriptVersion scriptVersion,
            DatasetVersion datasetVersion,
            String minioAccessKey,
            String minioSecretKey,
            String minioBucket,
            String targetNodeName
    ) {
        int attempt = currentAttempt(task);
        String jobName = KubernetesInferenceJobNaming.jobNameForInference(task.getId(), attempt);
        String inferenceLabel = KubernetesInferenceJobNaming.sanitizeLabelValue(task.getId());
        String callbackUrl = properties.getBackendServiceUrl()
                + "/api/internal/inference/result?id=" + task.getId()
                + "&attempt=" + attempt;
        ModelCacheSpec modelCache = modelCacheSpec(
                modelVersion,
                minioAccessKey,
                minioSecretKey,
                minioBucket
        );

        return """
                apiVersion: batch/v1
                kind: Job
                metadata:
                  name: %s
                  namespace: %s
                  labels:
                    app.kubernetes.io/name: tss-inference-job
                    app.kubernetes.io/part-of: tss-platform
                    tss.ai/inference-id: "%s"
                spec:
                  backoffLimit: 0
                  activeDeadlineSeconds: %d
                  ttlSecondsAfterFinished: %d
                  template:
                    metadata:
                      labels:
                        app.kubernetes.io/name: tss-inference-job
                        tss.ai/inference-id: "%s"
                    spec:
                      serviceAccountName: %s
                      automountServiceAccountToken: false
                      restartPolicy: Never
                %s
                      securityContext:
                        runAsNonRoot: true
                        runAsUser: 10001
                        runAsGroup: 10001
                        fsGroup: 10001
                        seccompProfile:
                          type: RuntimeDefault
                      volumes:
                        - name: workspace
                          emptyDir: {}
                %s%s      containers:
                        - name: inference-worker
                          image: %s
                          imagePullPolicy: %s
                          workingDir: /workspace/job
                          volumeMounts:
                            - name: workspace
                              mountPath: /workspace/job
                %s          env:
                            - name: INFERENCE_TASK_ID
                              value: "%s"
                            - name: INFERENCE_ATTEMPT
                              value: "%d"
                            - name: MODEL_VERSION_ID
                              value: "%s"
                            - name: SCRIPT_VERSION_ID
                              value: "%s"
                            - name: INPUT_MODE
                              value: "%s"
                            - name: DATASET_VERSION_ID
                              value: "%s"
                            - name: MODEL_STORAGE_PATH
                              value: "%s"
                            - name: SCRIPT_STORAGE_PATH
                              value: "%s"
                            - name: DATASET_STORAGE_PATH
                              value: "%s"
                            - name: INPUT_OBJECT_NAME
                              value: "%s"
                            - name: SCRIPT_ENTRY_FILE
                              value: "%s"
                            - name: PARAMS_JSON
                              value: "%s"
                            - name: MINIO_ENDPOINT
                              value: "%s"
                            - name: MINIO_ACCESS_KEY
                              value: "%s"
                            - name: MINIO_SECRET_KEY
                              value: "%s"
                            - name: MINIO_BUCKET
                              value: "%s"
                            - name: BACKEND_CALLBACK_URL
                              value: "%s"
                            - name: INTERNAL_CALLBACK_TOKEN
                              value: "%s"
                            - name: OUTPUT_OBJECT_PREFIX
                              value: "%s"
                %s          resources:
                            requests:
                              cpu: "%s"
                              memory: "%s"
                              ephemeral-storage: "%s"
                            limits:
                              cpu: "%s"
                              memory: "%s"
                              ephemeral-storage: "%s"
                          securityContext:
                            allowPrivilegeEscalation: false
                            capabilities:
                              drop:
                                - ALL
                """.formatted(
                jobName,
                properties.getNamespace(),
                inferenceLabel,
                properties.getJobActiveDeadlineSeconds(),
                effectiveJobTtlSecondsAfterFinished(),
                inferenceLabel,
                properties.getServiceAccount(),
                placementYaml(targetNodeName, modelCache),
                modelCache.volumeYaml(),
                modelCache.initContainerYaml(),
                workerImage,
                workerImagePullPolicy,
                modelCache.mainVolumeMountYaml(),
                escapeYaml(task.getId()),
                attempt,
                escapeYaml(task.getModelVersionId()),
                escapeYaml(task.getScriptVersionId()),
                escapeYaml(task.getInputMode()),
                escapeYaml(task.getDatasetVersionId() == null ? "" : task.getDatasetVersionId()),
                escapeYaml(modelVersion.getStoragePath()),
                escapeYaml(scriptVersion.getStoragePath()),
                escapeYaml(datasetVersion == null ? "" : datasetVersion.getStoragePath()),
                escapeYaml(task.getInputObjectName() == null ? "" : task.getInputObjectName()),
                escapeYaml(scriptVersion.getEntryFile()),
                escapeYaml((task.getParamsJson() == null ? "{}" : task.getParamsJson()).replace("\n", " ").replace("\r", " ")),
                properties.getMinioServiceUrl(),
                escapeYaml(minioAccessKey),
                escapeYaml(minioSecretKey),
                escapeYaml(minioBucket),
                escapeYaml(callbackUrl),
                escapeYaml(properties.requireInternalCallbackToken()),
                escapeYaml(outputObjectPrefix(task)),
                modelCache.mainEnvYaml(),
                cpuRequest,
                memoryRequest,
                ephemeralStorageRequest,
                cpuLimit,
                memoryLimit,
                ephemeralStorageLimit
        );
    }

    private int effectiveJobTtlSecondsAfterFinished() {
        return jobTtlPolicyService == null
                ? properties.getJobTtlSecondsAfterFinished()
                : jobTtlPolicyService.currentJobTtlSecondsAfterFinished();
    }

    private ModelCacheSpec modelCacheSpec(
            ModelVersion modelVersion,
            String minioAccessKey,
            String minioSecretKey,
            String minioBucket
    ) {
        if (!modelCacheProperties.isEnabled()) {
            return ModelCacheSpec.disabled();
        }

        String nodePath = requireCachePath(
                "inference.kubernetes.model-cache.node-path",
                modelCacheProperties.getNodePath()
        );
        String mountPath = requireCachePath(
                "inference.kubernetes.model-cache.mount-path",
                modelCacheProperties.getMountPath()
        );
        if (modelCacheProperties.getMaxBytes() <= 0) {
            throw new IllegalStateException("inference.kubernetes.model-cache.max-bytes must be positive");
        }
        if (modelCacheProperties.getMinFreeBytes() < 0) {
            throw new IllegalStateException("inference.kubernetes.model-cache.min-free-bytes must not be negative");
        }

        String digest = modelVersion == null || modelVersion.getArtifactAttestedSha256() == null
                ? ""
                : modelVersion.getArtifactAttestedSha256().trim().toLowerCase(Locale.ROOT);
        Long sizeBytes = modelVersion == null ? null : modelVersion.getSizeBytes();
        if (!SHA256_PATTERN.matcher(digest).matches() || sizeBytes == null || sizeBytes <= 0) {
            LOGGER.warn(
                    "Bypass model cache because model version {} has no attested SHA-256 or positive size",
                    modelVersion == null ? null : modelVersion.getId()
            );
            return ModelCacheSpec.disabled();
        }
        if (sizeBytes > modelCacheProperties.getMaxBytes()) {
            LOGGER.warn(
                    "Bypass model cache for model version {} because artifact size {} exceeds cache limit {}",
                    modelVersion.getId(),
                    sizeBytes,
                    modelCacheProperties.getMaxBytes()
            );
            return ModelCacheSpec.disabled();
        }

        String entrySubPath = "entries/" + digest + "/data";
        String lockSubPath = "locks/" + digest + ".lock";
        String volumeYaml = String.join(
                "\n",
                "        - name: model-cache",
                "          hostPath:",
                "            path: \"" + escapeYaml(nodePath) + "\"",
                "            type: Directory"
        ) + "\n";
        String initContainerYaml = String.join(
                "\n",
                "      initContainers:",
                "        - name: model-cache-initializer",
                "          image: " + workerImage,
                "          imagePullPolicy: " + workerImagePullPolicy,
                "          workingDir: /workspace/job",
                "          volumeMounts:",
                "            - name: model-cache",
                "              mountPath: \"" + escapeYaml(mountPath) + "\"",
                "          env:",
                "            - name: INFERENCE_WORKER_MODE",
                "              value: \"prepare-model-cache\"",
                "            - name: MODEL_CACHE_ROOT",
                "              value: \"" + escapeYaml(mountPath) + "\"",
                "            - name: MODEL_CACHE_KEY",
                "              value: \"" + digest + "\"",
                "            - name: MODEL_EXPECTED_SHA256",
                "              value: \"" + digest + "\"",
                "            - name: MODEL_EXPECTED_SIZE_BYTES",
                "              value: \"" + sizeBytes + "\"",
                "            - name: MODEL_CACHE_MAX_BYTES",
                "              value: \"" + modelCacheProperties.getMaxBytes() + "\"",
                "            - name: MODEL_CACHE_MIN_FREE_BYTES",
                "              value: \"" + modelCacheProperties.getMinFreeBytes() + "\"",
                "            - name: MODEL_STORAGE_PATH",
                "              value: \"" + escapeYaml(modelVersion.getStoragePath()) + "\"",
                "            - name: MINIO_ENDPOINT",
                "              value: \"" + escapeYaml(properties.getMinioServiceUrl()) + "\"",
                "            - name: MINIO_ACCESS_KEY",
                "              value: \"" + escapeYaml(minioAccessKey) + "\"",
                "            - name: MINIO_SECRET_KEY",
                "              value: \"" + escapeYaml(minioSecretKey) + "\"",
                "            - name: MINIO_BUCKET",
                "              value: \"" + escapeYaml(minioBucket) + "\"",
                "          securityContext:",
                "            allowPrivilegeEscalation: false",
                "            capabilities:",
                "              drop:",
                "                - ALL"
        ) + "\n";
        String mainVolumeMountYaml = String.join(
                "\n",
                "            - name: model-cache",
                "              mountPath: /workspace/job/model",
                "              subPath: \"" + entrySubPath + "\"",
                "              readOnly: true",
                "            - name: model-cache",
                "              mountPath: /var/run/tss-model-cache/model.lock",
                "              subPath: \"" + lockSubPath + "\"",
                "              readOnly: true"
        ) + "\n";
        String mainEnvYaml = String.join(
                "\n",
                "            - name: MODEL_CACHE_ENABLED",
                "              value: \"true\"",
                "            - name: MODEL_CACHE_LOCK_PATH",
                "              value: \"/var/run/tss-model-cache/model.lock\""
        ) + "\n";
        return new ModelCacheSpec(
                volumeYaml,
                initContainerYaml,
                mainVolumeMountYaml,
                mainEnvYaml
        );
    }

    private String requireCachePath(String propertyName, String rawValue) {
        String path = rawValue == null ? "" : rawValue.trim();
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        if (!LINUX_ABSOLUTE_PATH.matcher(path).matches() || path.contains("//")) {
            throw new IllegalStateException(propertyName + " must be a safe absolute Linux path");
        }
        for (String segment : path.substring(1).split("/")) {
            if (segment.equals(".") || segment.equals("..")) {
                throw new IllegalStateException(propertyName + " must not contain dot segments");
            }
        }
        return path;
    }

    private String placementYaml(String targetNodeName, ModelCacheSpec modelCache) {
        if (targetNodeName != null && !targetNodeName.isBlank()) {
            return "      nodeName: \"" + escapeYaml(targetNodeName.trim()) + "\"\n";
        }
        StringBuilder yaml = new StringBuilder("      nodeSelector:\n")
                .append("        tss.ai/node-pool: cpu\n");
        if (!modelCache.volumeYaml().isEmpty()) {
            yaml.append("        tss.ai/model-cache-ready: \"true\"\n");
        }
        return yaml.toString();
    }

    private record ModelCacheSpec(
            String volumeYaml,
            String initContainerYaml,
            String mainVolumeMountYaml,
            String mainEnvYaml
    ) {

        private static ModelCacheSpec disabled() {
            return new ModelCacheSpec("", "", "", "");
        }
    }

    private String outputObjectPrefix(InferenceTask task) {
        return "users/" + task.getOwnerUserId()
                + "/inference-results/" + task.getId()
                + "/attempt-" + currentAttempt(task);
    }

    private int currentAttempt(InferenceTask task) {
        return task.getCurrentAttempt() == null ? 1 : Math.max(task.getCurrentAttempt(), 1);
    }

    private String escapeYaml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
