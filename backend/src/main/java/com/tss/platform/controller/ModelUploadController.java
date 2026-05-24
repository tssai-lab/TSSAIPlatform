package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.ModelUploadProgressDto;
import com.tss.platform.dto.UploadCompleteRequest;
import com.tss.platform.dto.UploadInitRequest;
import com.tss.platform.service.ModelUploadService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/model/upload")
public class ModelUploadController {

    private final ModelUploadService service;

    public ModelUploadController(ModelUploadService service) {
        this.service = service;
    }

    @PostMapping("/init")
    public ApiResponse<ModelUploadProgressDto> init(@RequestBody UploadInitRequest req) {
        try {
            return ApiResponse.ok(service.init(req));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping(value = "/chunk", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ModelUploadProgressDto> chunk(
            @RequestParam String uploadId,
            @RequestParam Integer partIndex,
            @RequestParam("file") MultipartFile file
    ) {
        try {
            return ApiResponse.ok(service.saveChunk(uploadId, partIndex, file));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/progress")
    public ApiResponse<ModelUploadProgressDto> progress(@RequestParam String uploadId) {
        try {
            return ApiResponse.ok(service.getProgress(uploadId));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping("/complete")
    public ApiResponse<Map<String, Object>> complete(@RequestBody UploadCompleteRequest req) {
        try {
            return ApiResponse.ok(service.complete(req));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
