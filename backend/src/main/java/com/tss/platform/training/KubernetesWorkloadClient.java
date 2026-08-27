package com.tss.platform.training;

/**
 * Least-privilege control surface used by the training executor.
 *
 * <p>It deliberately exposes only the Job operations needed by training. Callers
 * cannot pass arbitrary kubectl commands or choose another credential source.</p>
 */
public interface KubernetesWorkloadClient {

    void applyTrainingJob(String namespace, String jobName, String jobYaml);

    boolean trainingJobExists(String namespace, String jobName);

    void deleteTrainingJob(String namespace, String jobName);
}
