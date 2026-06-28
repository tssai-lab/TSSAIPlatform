package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "training.kubernetes")
public class TrainingKubernetesProperties {

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

    private String cpuRequest = "500m";
    private String cpuLimit = "2";
    private String memoryRequest = "512Mi";
    private String memoryLimit = "4Gi";

    /** Job 最长运行时间（秒） */
    private int jobActiveDeadlineSeconds = 3600;

    /** Job 完成后保留时间（秒） */
    private int jobTtlSecondsAfterFinished = 86400;

    /** Worker 回调内部 token（通过环境变量 TRAINING_K8S_INTERNAL_CALLBACK_TOKEN 覆盖） */
    private String internalCallbackToken = "tss-internal-callback-dev";

    /** Job 状态轮询间隔（毫秒） */
    private long monitorIntervalMs = 30000;

    /** 环境初始化超时（秒） */
    private int bootstrapTimeoutSeconds = 600;
}
