package com.tss.platform.training;

/**
 * Small, least-privilege surface for applying and deleting training Jobs.
 *
 * <p>The control plane owns the configured kubeconfig. Callers cannot pass a
 * kubectl command, arbitrary resource kind, or a second credential source.</p>
 */
public interface KubernetesWorkloadClient {

    void applyTrainingJob(String namespace, String jobYaml);

    boolean deleteTrainingJob(String namespace, String jobName);
}
