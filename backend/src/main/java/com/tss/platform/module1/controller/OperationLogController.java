package com.tss.platform.module1.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.dto.OperationLogQueryDTO;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.service.OperationLogService;
import com.tss.platform.module1.util.LogAccessScope;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/log")
public class OperationLogController {

    @Resource
    private OperationLogService logService;

    @PostMapping("/record")
    public Result<?> recordLog(@RequestBody OperationLog log) {
        boolean success = logService.recordLog(log);
        return success ? Result.success(null) : Result.fail("记录日志失败");
    }

    @GetMapping("/list")
    public Result<List<OperationLog>> getLogList() {
        LogAccessScope scope = resolveScope();
        if (scope == LogAccessScope.SELF_ONLY) {
            return Result.noAuth("无权限访问，仅管理员可操作");
        }
        List<OperationLog> logList = logService.list();
        if (!isSuperAdmin()) {
            logList.forEach(item -> item.setIpAddress(null));
        }
        return Result.success(logList);
    }

    /**
     * 操作日志查询（日志管理 + 个人操作记录共用）
     * 超管/普管：管理端看全部；普通用户及个人中心：仅本人。IP 仅超管返回。
     */
    @PostMapping("/query")
    public Result<Map<String, Object>> queryLogs(@RequestBody(required = false) OperationLogQueryDTO queryDTO) {
        if (queryDTO == null) {
            queryDTO = new OperationLogQueryDTO();
        }
        if (queryDTO.getPage() == null || queryDTO.getPage() < 1) {
            queryDTO.setPage(1);
        }
        if (queryDTO.getSize() == null || queryDTO.getSize() < 1) {
            queryDTO.setSize(10);
        }

        LogAccessScope scope = resolveScope();
        applyScopeToQuery(queryDTO, scope);

        IPage<OperationLog> pageResult = logService.queryLogs(queryDTO);
        boolean hideIp = !isSuperAdmin();

        List<Map<String, Object>> records = pageResult.getRecords().stream()
                .map(log -> toRecordMap(log, hideIp))
                .collect(Collectors.toList());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("records", records);
        data.put("total", pageResult.getTotal());
        data.put("page", queryDTO.getPage());
        data.put("size", queryDTO.getSize());
        return Result.success(data, "ok");
    }

    @GetMapping("/types")
    public Result<Map<String, String>> getOperationTypes() {
        Map<String, String> types = new LinkedHashMap<>();
        types.put("LOGIN", "登录");
        types.put("LOGOUT", "登出");
        types.put("1", "新增");
        types.put("2", "删除");
        types.put("3", "修改");
        types.put("4", "重置");
        types.put("5", "登录");
        types.put("6", "退出");
        return Result.success(types, "ok");
    }

    @GetMapping("/objects")
    public Result<Map<String, String>> getOperationObjects() {
        Map<String, String> objects = new HashMap<>();
        objects.put("users", "用户");
        objects.put("roles", "角色");
        objects.put("logs", "日志");
        return Result.success(objects);
    }

    private void applyScopeToQuery(OperationLogQueryDTO queryDTO, LogAccessScope scope) {
        if (scope == LogAccessScope.SELF_ONLY) {
            queryDTO.setUserId(StpUtil.getLoginIdAsInt());
            queryDTO.setUsername(null);
            queryDTO.setForceOperatorUserIds(null);
            return;
        }
        // 超管/普管管理端：可查全部
        queryDTO.setForceOperatorUserIds(null);
        if (!isSuperAdmin()) {
            queryDTO.setIpAddress(null);
        }
    }

    private Map<String, Object> toRecordMap(OperationLog log, boolean hideIp) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", log.getId());
        row.put("userId", log.getUserId());
        row.put("userName", log.getUserName());
        row.put("operationType", mapTypeLabel(log.getOperationType()));
        row.put("operationObj", log.getOperationObj());
        row.put("ipAddress", hideIp ? null : log.getIpAddress());
        row.put("operationTime", log.getOperationTime());
        row.put("remarks", log.getRemarks());
        row.put("status", normalizeStatus(log.getStatus()));
        return row;
    }

    private String mapTypeLabel(String code) {
        if (code == null) {
            return "";
        }
        return switch (code) {
            case "5" -> "LOGIN";
            case "6" -> "LOGOUT";
            default -> code;
        };
    }

    private String normalizeStatus(String status) {
        if (status == null) {
            return "FAILED";
        }
        return "SUCCESS".equalsIgnoreCase(status) ? "SUCCESS" : "FAILED";
    }

    private LogAccessScope resolveScope() {
        Integer roleId = (Integer) StpUtil.getTokenSession().get("roleId");
        if (roleId != null && (roleId == 1 || roleId == 2)) {
            return LogAccessScope.ALL;
        }
        return LogAccessScope.SELF_ONLY;
    }

    private boolean isSuperAdmin() {
        Integer roleId = (Integer) StpUtil.getTokenSession().get("roleId");
        return roleId != null && roleId == 1;
    }
}
