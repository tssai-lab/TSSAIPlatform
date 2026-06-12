package com.tss.platform.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DatasetUploadRecoveryScheduler {

    private final DatasetUploadRecoveryService recoveryService;

    public DatasetUploadRecoveryScheduler(DatasetUploadRecoveryService recoveryService) {
        this.recoveryService = recoveryService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverOnStartup() {
        recoveryService.recoverStaleSessions();
    }

    @Scheduled(fixedDelay = 60_000)
    public void recoverCompletingUploads() {
        recoveryService.recoverStaleSessions();
    }
}
