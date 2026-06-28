package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.CodeVersionApprovalDto;
import com.tss.platform.service.CodeVersionService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/code/version")
public class CodeVersionController {

    private final CodeVersionService codeVersionService;

    public CodeVersionController(CodeVersionService codeVersionService) {
        this.codeVersionService = codeVersionService;
    }

    @PostMapping("/{codeVersionId}/approve")
    public ApiResponse<CodeVersionApprovalDto> approve(@PathVariable String codeVersionId) {
        try {
            return ApiResponse.ok(codeVersionService.approve(codeVersionId));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }
}
