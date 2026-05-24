package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "training.k8s")
public class TrainingK8sProperties {
    private boolean enabled = true;
    private String namespace = "tss-training";
    private String image = "tss/yolo-trainer-cpu:latest";
    private int gpuCount = 0;
    private String cpuRequest = "1";
    private String memoryRequest = "2Gi";
    private String pullPolicy = "IfNotPresent";
    private String kubeconfigPath = "";
}
