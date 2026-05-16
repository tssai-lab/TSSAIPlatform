package com.tss.platform.module1.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.service.OperationLogService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system/log")
public class SystemLogController {

    @Resource
    private OperationLogService operationLogService;

    @GetMapping("/list")
    public Result<Map<String, Object>> getLogList(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String operationType,
            @RequestParam(required = false) String operationObj,
            @RequestParam(required = false) String status) {

        Page<OperationLog> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<OperationLog> wrapper = new LambdaQueryWrapper<>();

        if (operationType != null && !operationType.isEmpty()) {
            wrapper.eq(OperationLog::getOperationType, operationType);
        }
        if (operationObj != null && !operationObj.isEmpty()) {
            wrapper.eq(OperationLog::getOperationObj, operationObj);
        }
        if (status != null && !status.isEmpty()) {
            wrapper.eq(OperationLog::getStatus, status);
        }

        wrapper.orderByDesc(OperationLog::getOperationTime);

        Page<OperationLog> result = operationLogService.page(page, wrapper);

        Map<String, Object> data = new HashMap<>();
        data.put("list", result.getRecords());
        data.put("total", result.getTotal());
        data.put("pageNum", pageNum);
        data.put("pageSize", pageSize);

        return Result.success(data, "查询成功");
    }

    @GetMapping("/types")
    public Result<List<Map<String, String>>> getLogTypes() {
        List<Map<String, String>> types = List.of(
                Map.of("key", "新增", "label", "新增"),
                Map.of("key", "删除", "label", "删除"),
                Map.of("key", "修改", "label", "修改"),
                Map.of("key", "重置", "label", "重置"),
                Map.of("key", "登录", "label", "登录"),
                Map.of("key", "退出", "label", "退出")
        );
        return Result.success(types, "查询成功");
    }

    @GetMapping("/objects")
    public Result<List<Map<String, String>>> getLogObjects() {
        List<Map<String, String>> objects = List.of(
                Map.of("key", "users", "label", "用户"),
                Map.of("key", "roles", "label", "角色"),
                Map.of("key", "logs", "label", "日志")
        );
        return Result.success(objects, "查询成功");
    }
}
