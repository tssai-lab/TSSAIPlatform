package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.ImportJobStatusDto;
import com.tss.platform.service.ImportJobQueryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dataset-samples/import")
public class ImportJobController {

    private final ImportJobQueryService service;

    public ImportJobController(ImportJobQueryService service) {
        this.service = service;
    }

    @GetMapping("/{importJobId}/status")
    public ApiResponse<ImportJobStatusDto> status(@PathVariable String importJobId) {
        try {
            return ApiResponse.ok(service.getStatus(importJobId));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
