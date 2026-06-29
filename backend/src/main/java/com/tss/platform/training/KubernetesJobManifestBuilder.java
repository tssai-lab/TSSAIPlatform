package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.TrainingExperimentVersion;
import org.springframework.stereotype.Component;

@Component
public class KubernetesJobManifestBuilder {

    private final TrainingKubernetesProperties properties;

    public KubernetesJobManifestBuilder(TrainingKubernetesProperties properties) {
        this.properties = properties;
    }

    public String buildJobYaml(
            TrainingExperimentVersion task,
            CodeVersion codeVersion,
            DatasetVersion datasetVersion,
            String minioAccessKey,
            String minioSecretKey,
            String minioBucket
    ) {
        String jobName = KubernetesJobNaming.jobNameForTraining(task.getId());
        String trainingLabel = KubernetesJobNaming.sanitizeLabelValue(task.getId());
        String hyperParams = escapeYaml(
                (task.getHyperParamsJson() == null ? "{}" : task.getHyperParamsJson())
                        .replace("\n", " ").replace("\r", " ")
        );
        String codePath = escapeYaml(codeVersion.getStoragePath());
        String datasetPath = escapeYaml(datasetVersion.getStoragePath());
        String codeVersionId = escapeYaml(task.getCodeVersionId());
        String datasetVersionId = escapeYaml(task.getDatasetVersionId());
        String trainingProfile = escapeYaml(
                task.getTrainingProfile() == null ? "" : task.getTrainingProfile()
        );
        String mlflowExperimentName = escapeYaml(properties.getMlflowExperimentName());
        String callbackUrl = properties.getBackendServiceUrl()
                + "/api/internal/training/result?id=" + task.getId();

        return """
                apiVersion: batch/v1
                kind: Job
                metadata:
                  name: %s
                  namespace: %s
                  labels:
                    app.kubernetes.io/name: tss-training-job
                    app.kubernetes.io/part-of: tss-platform
                    tss.ai/training-id: "%s"
                spec:
                  backoffLimit: 0
                  activeDeadlineSeconds: %d
                  ttlSecondsAfterFinished: %d
                  template:
                    metadata:
                      labels:
                        app.kubernetes.io/name: tss-training-job
                        tss.ai/training-id: "%s"
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
                        - name: training-worker
                          image: %s
                          imagePullPolicy: %s
                          workingDir: /workspace/job
                          volumeMounts:
                            - name: workspace
                              mountPath: /workspace/job
                          env:
                            - name: TRAINING_ID
                              value: "%s"
                            - name: TRAINING_PROFILE
                              value: "%s"
                            - name: CODE_VERSION_ID
                              value: "%s"
                            - name: DATASET_VERSION_ID
                              value: "%s"
                            - name: CODE_STORAGE_PATH
                              value: "%s"
                            - name: DATASET_STORAGE_PATH
                              value: "%s"
                            - name: HYPER_PARAMS_JSON
                              value: "%s"
                            - name: MINIO_ENDPOINT
                              value: "%s"
                            - name: MINIO_ACCESS_KEY
                              value: "%s"
                            - name: MINIO_SECRET_KEY
                              value: "%s"
                            - name: MINIO_BUCKET
                              value: "%s"
                            - name: MLFLOW_TRACKING_URI
                              value: "%s"
                            - name: MLFLOW_EXPERIMENT_NAME
                              value: "%s"
                            - name: BACKEND_CALLBACK_URL
                              value: "%s"
                            - name: INTERNAL_CALLBACK_TOKEN
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
                trainingLabel,
                properties.getJobActiveDeadlineSeconds(),
                properties.getJobTtlSecondsAfterFinished(),
                trainingLabel,
                properties.getServiceAccount(),
                properties.getWorkerImage(),
                properties.getWorkerImagePullPolicy(),
                escapeYaml(task.getId()),
                trainingProfile,
                codeVersionId,
                datasetVersionId,
                codePath,
                datasetPath,
                hyperParams,
                properties.getMinioServiceUrl(),
                escapeYaml(minioAccessKey),
                escapeYaml(minioSecretKey),
                escapeYaml(minioBucket),
                properties.getMlflowServiceUrl(),
                mlflowExperimentName,
                callbackUrl,
                escapeYaml(properties.getInternalCallbackToken()),
                properties.getCpuRequest(),
                properties.getMemoryRequest(),
                properties.getCpuLimit(),
                properties.getMemoryLimit()
        );
    }

    private String escapeYaml(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
