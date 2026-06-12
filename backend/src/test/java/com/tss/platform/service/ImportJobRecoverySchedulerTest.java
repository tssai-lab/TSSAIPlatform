package com.tss.platform.service;

import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.ImportJobRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ImportJobRecoverySchedulerTest {

    @Test
    void resetsStaleJobsAndLaunchesPendingJobs() {
        ImportJobRepository jobRepo = mock(ImportJobRepository.class);
        ImportJobLauncher launcher = mock(ImportJobLauncher.class);
        ImportJobService jobService = mock(ImportJobService.class);
        ImportJob pending = new ImportJob();
        pending.setId("ijob-pending");
        when(jobRepo.resetStaleRunning(
                eq("RUNNING"),
                eq("PENDING"),
                any(Instant.class),
                any(Instant.class)
        )).thenReturn(1);
        when(jobRepo.findTop100ByStatusOrderByCreatedAtAsc("PENDING")).thenReturn(List.of(pending));
        ImportJobRecoveryScheduler scheduler =
                new ImportJobRecoveryScheduler(jobRepo, launcher, jobService);

        scheduler.recoverJobs();

        verify(jobRepo).resetStaleRunning(
                eq("RUNNING"),
                eq("PENDING"),
                any(Instant.class),
                any(Instant.class)
        );
        verify(launcher).launch("ijob-pending");
    }

    @Test
    void heartbeatTickUpdatesOnlyLocallyActiveLeases() {
        ImportJobRepository jobRepo = mock(ImportJobRepository.class);
        ImportJobLauncher launcher = mock(ImportJobLauncher.class);
        ImportJobService jobService = mock(ImportJobService.class);
        ImportJobRecoveryScheduler scheduler =
                new ImportJobRecoveryScheduler(jobRepo, launcher, jobService);

        scheduler.heartbeat();

        verify(jobService).heartbeatActiveJobs();
    }
}
