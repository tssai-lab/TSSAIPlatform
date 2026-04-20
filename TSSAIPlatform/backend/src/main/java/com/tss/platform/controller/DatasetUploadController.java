package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.DatasetUploadCompleteRequest;
import com.tss.platform.dto.DatasetUploadInitRequest;
import com.tss.platform.dto.DatasetUploadProgressDto;
import com.tss.platform.service.DatasetUploadService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dataset/upload")
public class DatasetUploadController {

    private final DatasetUploadService service;

    public DatasetUploadController(DatasetUploadService service) {
        this.service = service;
    }

    @PostMapping("/init")
    public ApiResponse<DatasetUploadProgressDto> init(@RequestBody DatasetUploadInitRequest req) {
        try {
            return ApiResponse.ok(service.init(req));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping(value = "/chunk", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<DatasetUploadProgressDto> chunk(
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
    public ApiResponse<DatasetUploadProgressDto> progress(@RequestParam String uploadId) {
        try {
            return ApiResponse.ok(service.getProgress(uploadId));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping("/complete")
    public ApiResponse<Map<String, Object>> complete(@RequestBody DatasetUploadCompleteRequest req) {
        try {
            return ApiResponse.ok(service.complete(req));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @PostMapping(value = "/folder", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, Object>> folder(
            @RequestParam String datasetName,
            @RequestParam(required = false) String version,
            @RequestParam String type,
            @RequestParam(required = false) String remark,
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("paths") List<String> paths
    ) {
        try {
            return ApiResponse.ok(service.uploadCvFolder(datasetName, version, type, remark, files, paths));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
