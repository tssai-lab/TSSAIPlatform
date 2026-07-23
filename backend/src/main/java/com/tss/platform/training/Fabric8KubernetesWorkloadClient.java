package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import io.fabric8.kubernetes.api.model.HasMetadata;
import io.fabric8.kubernetes.api.model.batch.v1.Job;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Fabric8 implementation for the small, least-privilege training Job surface. */
@Component
public class Fabric8KubernetesWorkloadClient implements KubernetesWorkloadClient {

    private final TrainingKubernetesProperties properties;
    private final TrainingEnvironmentService environmentService;

    public Fabric8KubernetesWorkloadClient(
            TrainingKubernetesProperties properties,
            TrainingEnvironmentService environmentService
    ) {
        this.properties = properties;
        this.environmentService = environmentService;
    }

    @Override
    public void applyTrainingJob(String namespace, String jobYaml) {
        Job job = parseSingleTrainingJob(namespace, jobYaml);
        try (KubernetesClient client = openConfiguredClient()) {
            client.batch().v1().jobs().inNamespace(namespace).resource(job).createOrReplace();
        }
    }

    @Override
    public boolean deleteTrainingJob(String namespace, String jobName) {
        try (KubernetesClient client = openConfiguredClient()) {
            return client.batch().v1().jobs().inNamespace(namespace).withName(jobName).delete();
        }
    }

    private Job parseSingleTrainingJob(String namespace, String jobYaml) {
        if (jobYaml == null || jobYaml.isBlank()) {
            throw new IllegalArgumentException("training Job manifest is empty");
        }
        List<HasMetadata> resources;
        try (KubernetesClient parser = openConfiguredClient()) {
            resources = parser.load(new ByteArrayInputStream(jobYaml.getBytes(StandardCharsets.UTF_8))).items();
        }
        if (resources.size() != 1 || !(resources.get(0) instanceof Job job)) {
            throw new IllegalArgumentException("training manifest must contain exactly one batch/v1 Job");
        }
        if (job.getMetadata() == null || job.getMetadata().getName() == null || job.getMetadata().getName().isBlank()) {
            throw new IllegalArgumentException("training Job manifest has no metadata.name");
        }
        String manifestNamespace = job.getMetadata().getNamespace();
        if (manifestNamespace != null && !namespace.equals(manifestNamespace)) {
            throw new IllegalArgumentException("training Job manifest namespace does not match configured namespace");
        }
        if (!namespace.equals(properties.getNamespace())) {
            throw new IllegalArgumentException("training Job namespace is not the configured namespace");
        }
        job.getMetadata().setNamespace(namespace);
        return job;
    }

    private KubernetesClient openConfiguredClient() {
        Path kubeconfig = environmentService.resolveKubeconfig();
        if (!Files.isRegularFile(kubeconfig)) {
            throw new IllegalStateException("configured training kubeconfig does not exist: " + kubeconfig);
        }
        try {
            Config config = Config.fromKubeconfig(Files.readString(kubeconfig));
            return new KubernetesClientBuilder().withConfig(config).build();
        } catch (Exception e) {
            throw new IllegalStateException("cannot create Fabric8 client from configured training kubeconfig", e);
        }
    }
}
