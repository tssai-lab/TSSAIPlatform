package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import io.fabric8.kubernetes.api.model.HasMetadata;
import io.fabric8.kubernetes.api.model.batch.v1.Job;
import io.fabric8.kubernetes.client.KubernetesClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Fabric8 implementation of the restricted training Job control surface. */
@Component
@ConditionalOnProperty(prefix = "training.kubernetes", name = "client-mode", havingValue = "fabric8")
public class Fabric8KubernetesWorkloadClient implements KubernetesWorkloadClient {

    private static final Logger LOG = LoggerFactory.getLogger(Fabric8KubernetesWorkloadClient.class);

    private final TrainingKubernetesProperties properties;
    private final Fabric8KubernetesClientProvider clientProvider;

    public Fabric8KubernetesWorkloadClient(
            TrainingKubernetesProperties properties,
            Fabric8KubernetesClientProvider clientProvider
    ) {
        this.properties = properties;
        this.clientProvider = clientProvider;
        LOG.info("Training Kubernetes workload client selected: fabric8");
    }

    @Override
    public void applyTrainingJob(String namespace, String jobName, String jobYaml) {
        Job job = parseSingleTrainingJob(namespace, jobName, jobYaml);
        try {
            client().batch().v1().jobs().inNamespace(namespace).resource(job).create();
        } catch (RuntimeException exception) {
            // Never invoke kubectl here. The request might already have reached the API
            // server, so reconcile with the same Fabric8 client and deterministic name.
            try {
                if (trainingJobExists(namespace, jobName)) {
                    LOG.info("Training Job already exists after Fabric8 create failure; treating it as submitted: job={}", jobName);
                    return;
                }
            } catch (RuntimeException reconciliationFailure) {
                exception.addSuppressed(reconciliationFailure);
            }
            throw new KubernetesWorkloadException("Fabric8 training Job submission failed", exception);
        }
    }

    @Override
    public boolean trainingJobExists(String namespace, String jobName) {
        validateTarget(namespace, jobName);
        try {
            return client().batch().v1().jobs().inNamespace(namespace).withName(jobName).get() != null;
        } catch (RuntimeException exception) {
            throw new KubernetesWorkloadException("Fabric8 training Job existence check failed", exception);
        }
    }

    @Override
    public void deleteTrainingJob(String namespace, String jobName) {
        validateTarget(namespace, jobName);
        try {
            client().batch().v1().jobs().inNamespace(namespace).withName(jobName).delete();
        } catch (RuntimeException exception) {
            try {
                if (!trainingJobExists(namespace, jobName)) {
                    LOG.info("Training Job is absent after Fabric8 delete failure; treating it as deleted: job={}", jobName);
                    return;
                }
            } catch (RuntimeException reconciliationFailure) {
                exception.addSuppressed(reconciliationFailure);
            }
            throw new KubernetesWorkloadException("Fabric8 training Job deletion failed", exception);
        }
    }

    private Job parseSingleTrainingJob(String namespace, String expectedJobName, String jobYaml) {
        validateTarget(namespace, expectedJobName);
        if (jobYaml == null || jobYaml.isBlank()) {
            throw new IllegalArgumentException("training Job manifest is empty");
        }

        KubernetesClient configuredClient = client();
        List<HasMetadata> resources;
        try (ByteArrayInputStream input = new ByteArrayInputStream(jobYaml.getBytes(StandardCharsets.UTF_8))) {
            resources = configuredClient.load(input).items();
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("training Job manifest cannot be parsed", exception);
        } catch (Exception exception) {
            throw new IllegalStateException("training Job manifest input cannot be closed", exception);
        }
        if (resources == null || resources.size() != 1 || !(resources.get(0) instanceof Job job)) {
            throw new IllegalArgumentException("training manifest must contain exactly one batch/v1 Job");
        }
        if (!"batch/v1".equals(job.getApiVersion()) || !"Job".equals(job.getKind())) {
            throw new IllegalArgumentException("training manifest must contain exactly one batch/v1 Job");
        }
        if (job.getMetadata() == null
                || job.getMetadata().getName() == null
                || job.getMetadata().getName().isBlank()) {
            throw new IllegalArgumentException("training Job manifest has no metadata.name");
        }
        if (!expectedJobName.equals(job.getMetadata().getName())) {
            throw new IllegalArgumentException("training Job manifest name does not match the expected Job name");
        }
        String manifestNamespace = job.getMetadata().getNamespace();
        if (manifestNamespace != null && !manifestNamespace.isBlank() && !namespace.equals(manifestNamespace)) {
            throw new IllegalArgumentException("training Job manifest namespace does not match configured namespace");
        }
        job.getMetadata().setNamespace(namespace);
        return job;
    }

    private KubernetesClient client() {
        return clientProvider.getClient();
    }

    private void validateTarget(String namespace, String jobName) {
        if (namespace == null || !namespace.equals(properties.getNamespace())) {
            throw new IllegalArgumentException("training Job namespace is not the configured namespace");
        }
        if (jobName == null || jobName.isBlank()) {
            throw new IllegalArgumentException("training Job name is empty");
        }
    }
}
