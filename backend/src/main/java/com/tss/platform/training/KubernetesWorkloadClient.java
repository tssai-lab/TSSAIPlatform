package com.tss.platform.training;

import java.time.Instant;
import java.util.Optional;

/**
 * Least-privilege control surface used by the training executor.
 *
 * <p>It deliberately exposes only the Job operations needed by training. Callers
 * cannot pass arbitrary kubectl commands or choose another credential source.</p>
 */
public interface KubernetesWorkloadClient {

    record TrainingJobStatus(
            int succeeded,
            int failed,
            int active,
            String podWaitingReason,
            String podWaitingMessage,
            Instant podCreatedAt
    ) {
    }

    void applyTrainingJob(String namespace, String jobName, String jobYaml);

    boolean trainingJobExists(String namespace, String jobName);

    /**
     * Reads the Job counters together with the newest Pod's startup state.
     *
     * @return empty only when the named Job does not exist
     */
    Optional<TrainingJobStatus> getTrainingJobStatus(String namespace, String jobName);

    void deleteTrainingJob(String namespace, String jobName);
}
