package com.tss.platform.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class MinioDeleteTaskScheduler {

    private static final Logger log = LoggerFactory.getLogger(MinioDeleteTaskScheduler.class);

    private final MinioDeleteTaskService taskService;

    public MinioDeleteTaskScheduler(MinioDeleteTaskService taskService) {
        this.taskService = taskService;
    }

    @Scheduled(fixedDelay = 60_000L)
    public void processPendingTasks() {
        List<String> taskIds = taskService.findPendingTaskIds();
        if (taskIds.isEmpty()) {
            return;
        }
        log.info("MinIO delete scheduler picked {} pending task(s)", taskIds.size());
        for (String taskId : taskIds) {
            taskService.processPendingTask(taskId);
        }
    }
}
