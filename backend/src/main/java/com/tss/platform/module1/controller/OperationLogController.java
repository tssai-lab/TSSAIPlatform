
package com.tss.platform.module1.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.tss.platform.module1.common.Result;
import tss.platform.module1.demo.dto.OperationLogQueryDTO;
import tss.platform.module1.demo.dto.PageResultDTO;
import tss.platform.module1.demo.entity.OperationLog;
import tss.platform.module1.demo.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/log")
public class OperationLogController {

    @Autowired
    private OperationLogService logService;

    @PostMapping("/record")
    public Result<?> recordLog(@RequestBody OperationLog log) {
        boolean success = logService.recordLog(log);
        return success ? Result.success(null) : Result.fail("记录日志失败");
    }

    @GetMapping("/list")
    public Result<List<OperationLog>> getLogList() {
        List<OperationLog> logList = logService.list();
        return Result.success(logList);
    }

    @PostMapping("/query")
    public Result<PageResultDTO<OperationLog>> queryLogs(@RequestBody OperationLogQueryDTO queryDTO) {
        if (queryDTO.getPage() == null || queryDTO.getPage() < 1) {
            queryDTO.setPage(1);
        }
        if (queryDTO.getSize() == null || queryDTO.getSize() < 1) {
            queryDTO.setSize(10);
        }
        
        IPage<OperationLog> pageResult = logService.queryLogs(queryDTO);
        
        PageResultDTO<OperationLog> result = new PageResultDTO<>(
            pageResult.getRecords(),
            pageResult.getTotal(),
            queryDTO.getPage(),
            queryDTO.getSize()
        );
        
        return Result.success(result);
    }

    @GetMapping("/types")
    public Result<Map<String, String>> getOperationTypes() {
        Map<String, String> types = new HashMap<>();
        types.put("新增", "新增");
        types.put("删除", "删除");
        types.put("修改", "修改");
        types.put("重置", "重置");
        types.put("登录", "登录");
        types.put("退出", "退出");
        return Result.success(types);
    }

    @GetMapping("/objects")
    public Result<Map<String, String>> getOperationObjects() {
        Map<String, String> objects = new HashMap<>();
        objects.put("users", "用户");
        objects.put("roles", "角色");
        objects.put("logs", "日志");
        return Result.success(objects);
    }
}
