package com.tss.platform.controller;

import com.tss.platform.config.TrainingCallbackProperties;
import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.TrainingExperimentVersionDto;
import com.tss.platform.dto.TrainingResultCallbackRequest;
import com.tss.platform.service.TrainingExperimentService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/internal/training")
public class InternalTrainingController {
    private final TrainingExperimentService trainingExperimentService;
    private final TrainingCallbackProperties callbackProperties;

    public InternalTrainingController(
            TrainingExperimentService trainingExperimentService,
            TrainingCallbackProperties callbackProperties
    ) {
        this.trainingExperimentService = trainingExperimentService;
        this.callbackProperties = callbackProperties;
    }

    @PostMapping("/result")
    public ApiResponse<TrainingExperimentVersionDto> receiveResult(
            @RequestHeader(value = "X-Training-Callback-Token", required = false) String token,
            @RequestBody TrainingResultCallbackRequest request
    ) {
        if (request.getTrainingId() == null || request.getTrainingId().isBlank()) {
            return ApiResponse.fail("trainingId 不能为空");
        }
        if (token == null || !token.equals(callbackProperties.getToken())) {
            return ApiResponse.fail("callback token 无效");
        }
        try {
            TrainingExperimentService.TrainingResultUpdate update = new TrainingExperimentService.TrainingResultUpdate();
            update.setStatus(request.getStatus());
            update.setProgress(request.getProgress());
            update.setRunId(request.getRunId());
            update.setMetrics(request.getMetrics());
            update.setLogPath(request.getLogPath());
            update.setOutputPath(request.getOutputPath());
            update.setErrorSummary(request.getErrorSummary());
            return ApiResponse.ok(trainingExperimentService.applyTrainingResult(request.getTrainingId(), update));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
