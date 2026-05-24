package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.CreateTrainingExperimentRequest;
import com.tss.platform.dto.TrainingExperimentVersionDto;
import com.tss.platform.service.TrainingExperimentService;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/task")
public class TrainingTaskController {

    private final TrainingExperimentService service;

    public TrainingTaskController(TrainingExperimentService service) {
        this.service = service;
    }

    @PostMapping("/create")
    public ApiResponse<TrainingExperimentVersionDto> create(@RequestBody CreateTrainingExperimentRequest req) {
        try {
            return ApiResponse.ok(service.createExperiment(req));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/list")
    public ApiResponse<Map<String, Object>> list() {
        List<TrainingExperimentVersionDto> data = service.listLatestExperiments();
        Map<String, Object> result = new HashMap<>();
        result.put("data", data);
        result.put("total", data.size());
        return ApiResponse.ok(result);
    }

    @GetMapping("/detail")
    public ApiResponse<TrainingExperimentVersionDto> detail(@RequestParam String id) {
        try {
            return ApiResponse.ok(service.getByIdOrExperimentId(id));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping("/stop")
    public ApiResponse<TrainingExperimentVersionDto> stop(@RequestParam String id) {
        try {
            return ApiResponse.ok(service.stopTask(id));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @DeleteMapping("/delete")
    public ApiResponse<Object> delete(@RequestParam String id) {
        try {
            service.deleteExperiment(id);
            return ApiResponse.ok(null);
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
