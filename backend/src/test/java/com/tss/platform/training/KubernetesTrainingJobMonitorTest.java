package com.tss.platform.training;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.service.JobScheduler;
import com.tss.platform.training.plan.TrainingRunSpecCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KubernetesTrainingJobMonitorTest {

    private TrainingKubernetesProperties properties;
    private TrainingEnvironmentService environmentService;
    private TrainingExperimentVersionRepository repository;
    private TransactionTemplate transactionTemplate;
    private TrainingFailureDiagnosticService diagnosticService;
    private KubernetesTrainingJobMonitor monitor;

    @BeforeEach
    void setUp() {
        properties = new TrainingKubernetesProperties();
        properties.setEnabled(true);
        properties.setFailureDiagnosticsEnabled(true);
        properties.setFailureDiagnosticsRetryWindowSeconds(900);
        environmentService = mock(TrainingEnvironmentService.class);
        repository = mock(TrainingExperimentVersionRepository.class);
        transactionTemplate = mock(TransactionTemplate.class);
        diagnosticService = mock(TrainingFailureDiagnosticService.class);
        monitor = new KubernetesTrainingJobMonitor(
                properties,
                environmentService,
                repository,
                mock(ShellCommandRunner.class),
                mock(TrainingRunSpecCodec.class),
                transactionTemplate,
                mock(JobScheduler.class),
                diagnosticService
        );
        when(environmentService.isKubernetesReady()).thenReturn(true);
        when(repository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of());
        doAnswer(invocation -> {
            Consumer<TransactionStatus> callback = invocation.getArgument(0);
            callback.accept(mock(TransactionStatus.class));
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
        when(transactionTemplate.execute(any(TransactionCallback.class))).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(mock(TransactionStatus.class));
        });
    }

    @Test
    void retriesWorkerCallbackRaceAndAttachesArchivedLog() {
        TrainingExperimentVersion task = failedTask("train-race");
        when(repository
                .findTop100ByStatusAndLogPathIsNullAndFinishedAtAfterAndServerIpIsNotNullOrderByFinishedAtAsc(
                        any(),
                        any(Instant.class)
                ))
                .thenReturn(List.of(task));
        when(repository.findById(task.getId())).thenReturn(Optional.of(task));
        when(diagnosticService.archive(task, KubernetesJobNaming.jobNameForTraining(task.getId())))
                .thenReturn(new TrainingFailureDiagnosticService.CaptureResult(
                        true,
                        "minio://users/7/training-failure-diagnostics/train-race/failure.log"
                ));

        monitor.syncJobStatuses();

        assertEquals(
                "minio://users/7/training-failure-diagnostics/train-race/failure.log",
                task.getLogPath()
        );
        verify(repository).save(task);
    }

    @Test
    void unattachedObjectIsQueuedForDeletion() {
        TrainingExperimentVersion task = failedTask("train-deleted");
        when(repository
                .findTop100ByStatusAndLogPathIsNullAndFinishedAtAfterAndServerIpIsNotNullOrderByFinishedAtAsc(
                        any(),
                        any(Instant.class)
                ))
                .thenReturn(List.of(task));
        when(repository.findById(task.getId()))
                .thenReturn(Optional.of(task))
                .thenReturn(Optional.empty());
        String logPath = "minio://users/7/training-failure-diagnostics/train-deleted/failure.log";
        when(diagnosticService.archive(task, KubernetesJobNaming.jobNameForTraining(task.getId())))
                .thenReturn(new TrainingFailureDiagnosticService.CaptureResult(true, logPath));

        monitor.syncJobStatuses();

        verify(diagnosticService).enqueueDeletion(task, logPath);
    }

    private TrainingExperimentVersion failedTask(String id) {
        TrainingExperimentVersion task = new TrainingExperimentVersion();
        task.setId(id);
        task.setOwnerUserId(7);
        task.setStatus("failed");
        task.setServerIp("k8s-node1");
        task.setFinishedAt(Instant.now().minusSeconds(60));
        return task;
    }
}
