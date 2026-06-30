package com.tss.platform.inference;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.ModelVersion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class KubernetesInferenceJobManifestBuilder {

    private final TrainingKubernetesProperties properties;

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

    public KubernetesInferenceJobManifestBuilder(TrainingKubernetesProperties properties) {
        this.properties = properties;
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
        String jobName = KubernetesInferenceJobNaming.jobNameForInference(task.getId());
        String inferenceLabel = KubernetesInferenceJobNaming.sanitizeLabelValue(task.getId());
        String callbackUrl = properties.getBackendServiceUrl()
                + "/api/internal/inference/result?id=" + task.getId();

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
                      nodeSelector:
                        tss.ai/node-pool: cpu
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
                      containers:
                        - name: inference-worker
                          image: %s
                          imagePullPolicy: %s
                          workingDir: /workspace/job
                          volumeMounts:
                            - name: workspace
                              mountPath: /workspace/job
                          env:
                            - name: INFERENCE_TASK_ID
                              value: "%s"
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
                          resources:
                            requests:
                              cpu: "%s"
                              memory: "%s"
                            limits:
                              cpu: "%s"
                              memory: "%s"
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
                properties.getJobTtlSecondsAfterFinished(),
                inferenceLabel,
                properties.getServiceAccount(),
                workerImage,
                workerImagePullPolicy,
                escapeYaml(task.getId()),
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
                escapeYaml(properties.getInternalCallbackToken()),
                escapeYaml(outputObjectPrefix(task)),
                cpuRequest,
                memoryRequest,
                cpuLimit,
                memoryLimit
        );
    }

    private String outputObjectPrefix(InferenceTask task) {
        return "users/" + task.getOwnerUserId() + "/inference-results/" + task.getId();
    }

    private String escapeYaml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
