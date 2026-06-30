package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.InferenceScriptUploadResultDto;
import com.tss.platform.dto.InferenceScriptVersionDto;
import com.tss.platform.service.InferenceScriptService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/inference/scripts")
public class InferenceScriptController {

    private final InferenceScriptService scriptService;

    public InferenceScriptController(InferenceScriptService scriptService) {
        this.scriptService = scriptService;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<InferenceScriptUploadResultDto> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam String scriptName,
            @RequestParam(defaultValue = "v1") String version,
            @RequestParam(defaultValue = "PYTHON3") String runtime,
            @RequestParam String entryFile,
            @RequestParam(required = false) String paramsSchemaJson,
            @RequestParam(required = false) String remark
    ) {
        try {
            return ApiResponse.ok(scriptService.upload(
                    file,
                    scriptName,
                    version,
                    runtime,
                    entryFile,
                    paramsSchemaJson,
                    remark
            ));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping
    public ApiResponse<List<InferenceScriptVersionDto>> list() {
        return ApiResponse.ok(scriptService.listScripts());
    }

    @GetMapping("/{versionId}")
    public ApiResponse<InferenceScriptVersionDto> detail(@PathVariable String versionId) {
        try {
            return ApiResponse.ok(scriptService.getScript(versionId));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
