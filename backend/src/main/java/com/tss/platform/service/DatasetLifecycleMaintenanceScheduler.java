package com.tss.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DatasetLifecycleMaintenanceScheduler {

    private final DatasetLifecycleMaintenanceService maintenanceService;

    public DatasetLifecycleMaintenanceScheduler(
            DatasetLifecycleMaintenanceService maintenanceService
    ) {
        this.maintenanceService = maintenanceService;
    }

    @Scheduled(fixedDelay = 3_600_000)
    public void maintainDatasetLifecycle() {
        maintenanceService.cleanupFailedDrafts();
        maintenanceService.purgeSoftDeletedVersions();
    }
}
