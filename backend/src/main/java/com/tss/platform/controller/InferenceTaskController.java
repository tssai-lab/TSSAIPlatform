package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.CreateInferenceTaskRequest;
import com.tss.platform.dto.InferenceTaskDto;
import com.tss.platform.dto.InferenceTaskResultDto;
import com.tss.platform.dto.PageResponse;
import com.tss.platform.service.InferenceTaskService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inference/tasks")
public class InferenceTaskController {

    private final InferenceTaskService taskService;

    public InferenceTaskController(InferenceTaskService taskService) {
        this.taskService = taskService;
    }

    @PostMapping
    public ApiResponse<InferenceTaskDto> create(@RequestBody CreateInferenceTaskRequest req) {
        try {
            return ApiResponse.ok(taskService.createTask(req));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping
    public ApiResponse<PageResponse<InferenceTaskDto>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String status
    ) {
        try {
            return ApiResponse.ok(taskService.listTasks(page, pageSize, status));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ApiResponse<InferenceTaskDto> detail(@PathVariable String id) {
        try {
            return ApiResponse.ok(taskService.getTask(id));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/stop")
    public ApiResponse<InferenceTaskDto> stop(@PathVariable String id) {
        try {
            return ApiResponse.ok(taskService.stopTask(id));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/result")
    public ApiResponse<InferenceTaskResultDto> result(@PathVariable String id) {
        try {
            return ApiResponse.ok(taskService.getResult(id));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
