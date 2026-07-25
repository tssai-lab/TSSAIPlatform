package com.tss.platform.module1.controller;

import com.tss.platform.dto.SystemConfigDto;
import com.tss.platform.dto.SystemConfigUpdateRequest;
import com.tss.platform.module1.common.Result;
import com.tss.platform.service.CodeApprovalForbiddenException;
import com.tss.platform.service.SystemConfigService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/config")
public class SystemConfigController {

    private final SystemConfigService service;

    public SystemConfigController(SystemConfigService service) {
        this.service = service;
    }

    @GetMapping("/get")
    public Result<SystemConfigDto> get() {
        try {
            return Result.success(service.getForAdministration(), "查询成功");
        } catch (CodeApprovalForbiddenException exception) {
            return Result.noAuth("无权限访问，仅管理员可操作");
        }
    }

    @PostMapping("/update")
    public Result<SystemConfigDto> update(
            @RequestBody(required = false) SystemConfigUpdateRequest request
    ) {
        try {
            return Result.success(service.updateForAdministration(request), "更新成功");
        } catch (CodeApprovalForbiddenException exception) {
            return Result.noAuth("无权限访问，仅管理员可操作");
        } catch (IllegalArgumentException exception) {
            return Result.fail(exception.getMessage());
        }
    }
}
