package com.tss.platform.service;

import com.tss.platform.config.TrainingK8sProperties;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.ConfigBuilder;
import io.fabric8.kubernetes.client.DefaultKubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClient;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class KubernetesClientFactory {
    private final TrainingK8sProperties properties;

    public KubernetesClientFactory(TrainingK8sProperties properties) {
        this.properties = properties;
    }

    public KubernetesClient createClient() {
        String kubeconfigPath = trimToNull(properties.getKubeconfigPath());
        if (kubeconfigPath == null) {
            return new DefaultKubernetesClient();
        }
        try {
            String raw = Files.readString(Path.of(kubeconfigPath), StandardCharsets.UTF_8);
            Config config = Config.fromKubeconfig(raw);
            return new DefaultKubernetesClient(new ConfigBuilder(config).build());
        } catch (IOException e) {
            throw new IllegalStateException("读取 kubeconfig 失败: " + e.getMessage(), e);
        }
    }

    private String trimToNull(String text) {
        if (text == null) {
            return null;
        }
        String result = text.trim();
        return result.isEmpty() ? null : result;
    }
}
