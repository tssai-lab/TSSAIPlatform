package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.CodeUploadResultDto;
import com.tss.platform.service.CodeUploadService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/code/upload")
public class CodeUploadController {

    private final CodeUploadService service;

    public CodeUploadController(CodeUploadService service) {
        this.service = service;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<CodeUploadResultDto> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam String codeName,
            @RequestParam(defaultValue = "v1") String version,
            @RequestParam String trainingProfile,
            @RequestParam(required = false) String remark
    ) {
        try {
            return ApiResponse.ok(service.upload(file, codeName, version, trainingProfile, remark));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
