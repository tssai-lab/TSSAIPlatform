package com.tss.platform.service;

import com.tss.platform.config.TrainingK8sProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Component
public class TrainingJobStatusPoller {
    private final TrainingExperimentVersionRepository repository;
    private final TrainingSchedulerService schedulerService;
    private final TrainingK8sProperties k8sProperties;

    public TrainingJobStatusPoller(
            TrainingExperimentVersionRepository repository,
            TrainingSchedulerService schedulerService,
            TrainingK8sProperties k8sProperties
    ) {
        this.repository = repository;
        this.schedulerService = schedulerService;
        this.k8sProperties = k8sProperties;
    }

    @Scheduled(fixedDelayString = "${training.k8s.poll-interval-ms:10000}")
    @Transactional
    public void poll() {
        if (!k8sProperties.isEnabled()) {
            return;
        }
        List<TrainingExperimentVersion> inFlight = repository.findByStatusIn(List.of("queued", "running", "pending"));
        for (TrainingExperimentVersion item : inFlight) {
            if (item.getK8sJobName() == null || item.getK8sJobName().isBlank()) {
                continue;
            }
            if ("local".equals(item.getK8sNamespace()) || item.getK8sJobName().startsWith("local-")) {
                continue;
            }
            schedulerService.getRuntimeStatus(item.getK8sNamespace(), item.getK8sJobName()).ifPresent(status -> {
                if (!status.status().equals(item.getStatus())) {
                    item.setStatus(status.status());
                    item.setUpdatedAt(Instant.now());
                }
                if (status.progress() != null) {
                    item.setProgressPercent(status.progress());
                }
                if (status.reason() != null && !status.reason().isBlank() && "failed".equals(status.status())) {
                    item.setErrorSummary(status.reason());
                }
                repository.save(item);
            });
        }
    }
}
