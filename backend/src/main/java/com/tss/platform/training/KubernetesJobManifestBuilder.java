package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.training.plan.TrainingRunSpec;
import com.tss.platform.training.plan.TrainingRunSpecCodec;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Renders a task-specific Job from the immutable RunSpec, never from a hard-coded training profile. */
@Component
public class KubernetesJobManifestBuilder {

    private final TrainingKubernetesProperties properties;
    private final TrainingRunSpecCodec runSpecCodec;
    private final TrainingRuntimeImageService runtimeImageService;

    public KubernetesJobManifestBuilder(
            TrainingKubernetesProperties properties,
            TrainingRunSpecCodec runSpecCodec,
            TrainingRuntimeImageService runtimeImageService
    ) {
        this.properties = properties;
        this.runSpecCodec = runSpecCodec;
        this.runtimeImageService = runtimeImageService;
    }

    public String buildJobYaml(
            TrainingExperimentVersion task,
            String minioAccessKey,
            String minioSecretKey,
            String minioBucket
    ) {
        TrainingRunSpec runSpec = runSpecCodec.decode(task);
        String jobName = KubernetesJobNaming.jobNameForTraining(task.getId());
        String trainingLabel = KubernetesJobNaming.sanitizeLabelValue(task.getId());
        long deadlineSeconds = Math.min(properties.getJobActiveDeadlineSeconds(), runSpec.security().maxRuntimeSeconds());
        String image = runtimeImageService.resolveImage(runSpec);
        String callbackUrl = properties.getBackendServiceUrl() + "/api/internal/training/result?id=" + task.getId();

        StringBuilder yaml = new StringBuilder(8192 + task.getRunSpecJson().length());
        line(yaml, 0, "apiVersion: batch/v1");
        line(yaml, 0, "kind: Job");
        line(yaml, 0, "metadata:");
        line(yaml, 2, "name: " + jobName);
        line(yaml, 2, "namespace: " + properties.getNamespace());
        line(yaml, 2, "labels:");
        line(yaml, 4, "app.kubernetes.io/name: tss-training-job");
        line(yaml, 4, "app.kubernetes.io/part-of: tss-platform");
        line(yaml, 4, "tss.ai/training-id: " + quote(trainingLabel));
        line(yaml, 0, "spec:");
        line(yaml, 2, "backoffLimit: 0");
        line(yaml, 2, "activeDeadlineSeconds: " + deadlineSeconds);
        line(yaml, 2, "ttlSecondsAfterFinished: " + properties.getJobTtlSecondsAfterFinished());
        line(yaml, 2, "template:");
        line(yaml, 4, "metadata:");
        line(yaml, 6, "labels:");
        line(yaml, 8, "app.kubernetes.io/name: tss-training-job");
        line(yaml, 8, "tss.ai/training-id: " + quote(trainingLabel));
        line(yaml, 4, "spec:");
        line(yaml, 6, "serviceAccountName: " + properties.getServiceAccount());
        line(yaml, 6, "automountServiceAccountToken: false");
        line(yaml, 6, "restartPolicy: Never");
        appendNodeSelector(yaml, runSpec.resources().nodeSelector());
        line(yaml, 6, "securityContext:");
        line(yaml, 8, "runAsNonRoot: " + runSpec.security().runAsNonRoot());
        line(yaml, 8, "runAsUser: 10001");
        line(yaml, 8, "runAsGroup: 10001");
        line(yaml, 8, "fsGroup: 10001");
        line(yaml, 8, "seccompProfile:");
        line(yaml, 10, "type: RuntimeDefault");
        line(yaml, 6, "volumes:");
        line(yaml, 8, "- name: workspace");
        line(yaml, 10, "emptyDir:");
        line(yaml, 12, "sizeLimit: " + quote(runSpec.resources().ephemeralStorageLimit()));
        line(yaml, 6, "containers:");
        line(yaml, 8, "- name: training-worker");
        line(yaml, 10, "image: " + quote(image));
        line(yaml, 10, "imagePullPolicy: " + runSpec.runtime().imagePullPolicy());
        line(yaml, 10, "workingDir: " + runSpec.workspace().codeDir());
        line(yaml, 10, "volumeMounts:");
        line(yaml, 12, "- name: workspace");
        line(yaml, 14, "mountPath: /workspace/job");
        line(yaml, 10, "env:");
        appendEnv(yaml, "TRAINING_ID", task.getId());
        appendEnv(yaml, "RUN_SPEC_JSON", task.getRunSpecJson());
        appendEnv(yaml, "RUN_SPEC_SHA256", task.getRunSpecSha256());
        appendEnv(yaml, "MINIO_ENDPOINT", properties.getMinioServiceUrl());
        appendEnv(yaml, "MINIO_ACCESS_KEY", minioAccessKey);
        appendEnv(yaml, "MINIO_SECRET_KEY", minioSecretKey);
        appendEnv(yaml, "MINIO_BUCKET", minioBucket);
        appendEnv(yaml, "MLFLOW_TRACKING_URI", properties.getMlflowServiceUrl());
        appendEnv(yaml, "MLFLOW_EXPERIMENT_NAME", properties.getMlflowExperimentName());
        appendEnv(yaml, "BACKEND_CALLBACK_URL", callbackUrl);
        appendEnv(yaml, "INTERNAL_CALLBACK_TOKEN", properties.requireInternalCallbackToken());
        line(yaml, 10, "resources:");
        line(yaml, 12, "requests:");
        line(yaml, 14, "cpu: " + quote(runSpec.resources().cpuRequest()));
        line(yaml, 14, "memory: " + quote(runSpec.resources().memoryRequest()));
        line(yaml, 12, "limits:");
        line(yaml, 14, "cpu: " + quote(runSpec.resources().cpuLimit()));
        line(yaml, 14, "memory: " + quote(runSpec.resources().memoryLimit()));
        line(yaml, 14, "ephemeral-storage: " + quote(runSpec.resources().ephemeralStorageLimit()));
        if (runSpec.resources().gpuCount() != null && runSpec.resources().gpuCount() > 0) {
            line(yaml, 14, "nvidia.com/gpu: " + quote(runSpec.resources().gpuCount().toString()));
        }
        line(yaml, 10, "securityContext:");
        line(yaml, 12, "allowPrivilegeEscalation: " + runSpec.security().allowPrivilegeEscalation());
        line(yaml, 12, "capabilities:");
        line(yaml, 14, "drop:");
        line(yaml, 16, "- ALL");
        return yaml.toString();
    }

    private void appendNodeSelector(StringBuilder yaml, Map<String, String> nodeSelector) {
        if (nodeSelector == null || nodeSelector.isEmpty()) {
            return;
        }
        line(yaml, 6, "nodeSelector:");
        nodeSelector.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .forEach(entry -> line(yaml, 8, quote(entry.getKey()) + ": " + quote(entry.getValue())));
    }

    private void appendEnv(StringBuilder yaml, String name, String value) {
        line(yaml, 12, "- name: " + name);
        line(yaml, 14, "value: " + quote(value));
    }

    private void line(StringBuilder yaml, int spaces, String value) {
        yaml.append(" ".repeat(spaces)).append(value).append('\n');
    }

    private String quote(String value) {
        if (value == null) {
            return "\"\"";
        }
        String escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
        return "\"" + escaped + "\"";
    }
}
