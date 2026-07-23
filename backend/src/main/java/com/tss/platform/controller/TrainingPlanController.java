package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.training.plan.TrainingPlanDefinition;
import com.tss.platform.training.plan.TrainingPlanRegistry;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only catalogue used by the task-creation UI; plans are no longer hard-coded there. */
@RestController
@RequestMapping("/api/training-plans")
public class TrainingPlanController {

    private final TrainingPlanRegistry trainingPlanRegistry;

    public TrainingPlanController(TrainingPlanRegistry trainingPlanRegistry) {
        this.trainingPlanRegistry = trainingPlanRegistry;
    }

    @GetMapping
    public ApiResponse<List<TrainingPlanDefinition>> list(
            @RequestParam(value = "includeDisabled", defaultValue = "false") boolean includeDisabled
    ) {
        return ApiResponse.ok(trainingPlanRegistry.listLatest(includeDisabled));
    }
}
