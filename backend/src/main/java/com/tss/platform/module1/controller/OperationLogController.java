package com.tss.platform.module1.controller;

import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/log")
public class OperationLogController {

    @Autowired // 替换为Spring原生注解，稳定兼容
    private OperationLogService logService;

    // 1. 记录操作日志（前端操作后调用，如“上传文件”）
    @PostMapping("/record")
    public Result<?> recordLog(@RequestBody OperationLog log) {
        boolean success = logService.recordLog(log);
        return success ? Result.success(null) : Result.fail("记录日志失败");
    }

    // 2. 查询日志列表（前端日志监控页面）
    @GetMapping("/list")
    public Result<List<OperationLog>> getLogList() {
        List<OperationLog> logList = logService.list();
        return Result.success(logList);
    }
}
