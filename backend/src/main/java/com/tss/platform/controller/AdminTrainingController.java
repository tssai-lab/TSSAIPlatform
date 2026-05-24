package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.service.DemoAssetInitService;
import com.tss.platform.service.RemoteK8sInstallService;
import com.tss.platform.service.TrainingSchedulerService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminTrainingController {
    private final RemoteK8sInstallService remoteK8sInstallService;
    private final TrainingSchedulerService trainingSchedulerService;
    private final DemoAssetInitService demoAssetInitService;

    public AdminTrainingController(
            RemoteK8sInstallService remoteK8sInstallService,
            TrainingSchedulerService trainingSchedulerService,
            DemoAssetInitService demoAssetInitService
    ) {
        this.remoteK8sInstallService = remoteK8sInstallService;
        this.trainingSchedulerService = trainingSchedulerService;
        this.demoAssetInitService = demoAssetInitService;
    }

    @PostMapping("/k8s/install")
    public ApiResponse<Map<String, Object>> installK8s() {
        try {
            return ApiResponse.ok(remoteK8sInstallService.installOrCheckK3s());
        } catch (Exception e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/k8s/status")
    public ApiResponse<Map<String, Object>> k8sStatus() {
        TrainingSchedulerService.K8sClusterStatus status = trainingSchedulerService.getClusterStatus();
        if (!status.ready()) {
            return ApiResponse.fail(status.message());
        }
        return ApiResponse.ok(Map.of(
                "ready", status.ready(),
                "namespace", status.namespace(),
                "image", status.image(),
                "readyNodes", status.readyNodes(),
                "message", status.message()
        ));
    }

    @PostMapping("/demo-assets/init")
    public ApiResponse<Map<String, Object>> initDemoAssets() {
        try {
            return ApiResponse.ok(demoAssetInitService.initDemoAssets());
        } catch (Exception e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
