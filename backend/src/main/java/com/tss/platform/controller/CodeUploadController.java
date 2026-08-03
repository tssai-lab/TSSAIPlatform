package com.tss.platform.controller;

import com.tss.platform.module1.common.AuditObjectType;
import com.tss.platform.module1.service.AuditHooks;
import org.springframework.beans.factory.annotation.Autowired;
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
    @Autowired
    private AuditHooks auditHooks;


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
            var __auditData = service.upload(file, codeName, version, trainingProfile, remark);
            auditHooks.upload(AuditObjectType.TRAINING_CODE,
                    __auditData != null ? String.valueOf(__auditData) : codeName,
                    "CODE_UPLOAD", true, null);
            return ApiResponse.ok(__auditData);
        } catch (RuntimeException exception) {
            auditHooks.upload(AuditObjectType.TRAINING_CODE, codeName, "CODE_UPLOAD", false, "代码资产导入失败");
            return ApiResponse.fail("代码资产导入失败");
        }
    }
}
