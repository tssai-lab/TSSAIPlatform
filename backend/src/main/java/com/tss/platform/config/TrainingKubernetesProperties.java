package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Getter
@Setter
@ConfigurationProperties(prefix = "training.kubernetes")
public class TrainingKubernetesProperties {

    public static final String PUBLIC_DEVELOPMENT_INTERNAL_CALLBACK_TOKEN =
            "tss-internal-callback-dev";

    /** 是否启用 K8s 训练调度（false 时回退本地 Java 训练） */
    private boolean enabled = true;

    /** 启动时环境不可用时是否自动创建 kind 集群 */
    private boolean autoCreate = true;

    /** 启动时是否执行连通性 verify Job */
    private boolean verifyOnStartup = true;

    /** 环境初始化失败时是否回退本地训练 */
    private boolean fallbackToLocal = true;

    private String clusterName = "tss-training";
    private String namespace = "tss-training";
    private String serviceAccount = "tss-training-worker";

    /** 项目根目录相对路径，用于定位脚本与 kubeconfig */
    private String projectRoot = "..";

    private String kubeconfig = "k8s/.kube/config";
    private String kindPath = ".tools/bin/kind";
    private String kubectlPath = ".tools/bin/kubectl";
    private String bootstrapScript = "backend/scripts/k8s/bootstrap-local-kind.sh";
    private String verifyScript = "backend/scripts/k8s/verify-local-kind.sh";

    private String workerImage = "tss-training-worker:local";
    private String workerImagePullPolicy = "IfNotPresent";

    /** Worker 容器内访问宿主机服务的 K8s Service 名称 */
    private String backendServiceUrl = "http://tss-backend:8080";
    private String minioServiceUrl = "http://tss-minio:9000";
    private String mlflowServiceUrl = "http://tss-mlflow:5000";

    /** K8s Worker 写入 MLflow 的 experiment 名称（可通过 env 覆盖） */
    private String mlflowExperimentName = "TSSAI-K8s-Training";

    private String cpuRequest = "500m";
    private String cpuLimit = "2";
    private String memoryRequest = "512Mi";
    private String memoryLimit = "4Gi";

    /** Job 最长运行时间（秒） */
    private int jobActiveDeadlineSeconds = 3600;

    /** Job 完成后保留时间（秒） */
    private int jobTtlSecondsAfterFinished = 3600;

    /** Worker 回调内部 token（通过环境变量 TRAINING_K8S_INTERNAL_CALLBACK_TOKEN 覆盖） */
    private String internalCallbackToken = "";

    /** Job 状态轮询间隔（毫秒） */
    private long monitorIntervalMs = 30000;

    /** 环境初始化超时（秒） */
    private int bootstrapTimeoutSeconds = 600;

    public String requireInternalCallbackToken() {
        String token = normalizedInternalCallbackToken();
        if (token == null) {
            throw new IllegalStateException(
                    "training.kubernetes.internal-callback-token must be configured"
            );
        }
        return token;
    }

    public boolean hasPublicDevelopmentInternalCallbackToken() {
        return PUBLIC_DEVELOPMENT_INTERNAL_CALLBACK_TOKEN.equals(
                normalizedInternalCallbackToken()
        );
    }

    public boolean matchesInternalCallbackToken(String candidate) {
        String configured = normalizedInternalCallbackToken();
        if (configured == null || candidate == null || candidate.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                configured.getBytes(StandardCharsets.UTF_8),
                candidate.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String normalizedInternalCallbackToken() {
        if (internalCallbackToken == null || internalCallbackToken.isBlank()) {
            return null;
        }
        return internalCallbackToken.trim();
    }
}
