package com.tss.platform.module1.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.dto.LogItemVO;
import com.tss.platform.module1.dto.LogListQueryDTO;
import com.tss.platform.module1.service.OperationLogService;
import com.tss.platform.module1.util.LogAccessScope;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system/log")
public class SystemLogController {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Resource
    private OperationLogService operationLogService;

    @GetMapping("/list")
    public Result<Map<String, Object>> getLogList(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String operateType,
            @RequestParam(required = false) List<String> operateTime,
            @RequestParam(required = false) String ip,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String logType,
            @RequestParam(required = false) String currentUserRole,
            @RequestParam(required = false) String currentUsername,
            @RequestParam(required = false) String content) {

        LogAccessScope scope = resolveScope();
        Result<Map<String, Object>> authError = checkLogAccess(scope, currentUsername);
        if (authError != null) {
            return authError;
        }

        LogListQueryDTO query = new LogListQueryDTO();
        query.setPageNum(pageNum);
        query.setPageSize(pageSize);
        query.setUsername(username);
        query.setOperateType(operateType);
        query.setIp(ip);
        query.setResult(result);
        query.setLogType(logType);
        query.setContent(content);
        parseOperateTime(operateTime, query);
        applyScope(query, scope, currentUsername);

        IPage<LogItemVO> pageResult = operationLogService.queryLogPage(query);

        Map<String, Object> data = new HashMap<>();
        data.put("list", pageResult.getRecords());
        data.put("total", pageResult.getTotal());
        data.put("pageNum", pageNum);
        data.put("pageSize", pageSize);

        return Result.success(data, "查询成功");
    }

    @GetMapping("/export")
    public Result<Map<String, Object>> exportLogs(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10000") Integer pageSize,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String operateType,
            @RequestParam(required = false) List<String> operateTime,
            @RequestParam(required = false) String ip,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String logType,
            @RequestParam(required = false) String currentUserRole,
            @RequestParam(required = false) String currentUsername,
            @RequestParam(required = false) String content) {

        LogAccessScope scope = resolveScope();
        if (scope != LogAccessScope.ALL) {
            return Result.noAuth("无权限导出日志");
        }

        LogListQueryDTO query = new LogListQueryDTO();
        query.setPageNum(pageNum);
        query.setPageSize(Math.min(pageSize, 10000));
        query.setUsername(username);
        query.setOperateType(operateType);
        query.setIp(ip);
        query.setResult(result);
        query.setLogType(logType);
        query.setContent(content);
        parseOperateTime(operateTime, query);

        IPage<LogItemVO> pageResult = operationLogService.queryLogPage(query);
        Map<String, Object> data = new HashMap<>();
        data.put("list", pageResult.getRecords());
        data.put("total", pageResult.getTotal());
        return Result.success(data, "导出成功（共 " + pageResult.getTotal() + " 条）");
    }

    @GetMapping("/types")
    public Result<List<Map<String, String>>> getLogTypes() {
        List<Map<String, String>> types = List.of(
                Map.of("key", "1", "label", "新增"),
                Map.of("key", "2", "label", "删除"),
                Map.of("key", "3", "label", "修改"),
                Map.of("key", "4", "label", "重置"),
                Map.of("key", "5", "label", "登录"),
                Map.of("key", "6", "label", "退出")
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

    private Result<Map<String, Object>> checkLogAccess(LogAccessScope scope, String currentUsername) {
        if (scope == LogAccessScope.SELF_ONLY) {
            // 普通用户：允许查本人；currentUsername 若传则必须与 Token 一致
            if (currentUsername != null && !currentUsername.isBlank()) {
                String loginUser = getLoginUsername();
                if (loginUser == null || !loginUser.equals(currentUsername.trim())) {
                    return Result.noAuth("仅可查看本人操作记录");
                }
            }
            return null;
        }
        // 管理员可查管理端日志；若带 currentUsername 则按个人中心处理
        if (currentUsername != null && !currentUsername.isBlank()) {
            String loginUser = getLoginUsername();
            if (loginUser == null || !loginUser.equals(currentUsername.trim())) {
                return Result.noAuth("仅可查看本人操作记录");
            }
        }
        return null;
    }

    private void applyScope(LogListQueryDTO query, LogAccessScope scope, String currentUsername) {
        // 不信任前端 currentUserRole
        query.setCurrentUserRole(null);

        if (scope == LogAccessScope.SELF_ONLY
                || (currentUsername != null && !currentUsername.isBlank())) {
            query.setForceUserId(StpUtil.getLoginIdAsInt());
            query.setCurrentUsername(null);
            query.setUsername(null);
            query.setForceNormalUsersOnly(false);
            query.setHideIp(!isSuperAdmin());
            return;
        }

        // 超管/普管管理端：看全部人；普管隐藏 IP
        query.setForceNormalUsersOnly(false);
        query.setHideIp(!isSuperAdmin());
        if (!isSuperAdmin()) {
            query.setIp(null);
        }
    }

    private void parseOperateTime(List<String> operateTime, LogListQueryDTO query) {
        if (operateTime == null || operateTime.size() < 2) {
            return;
        }
        String start = operateTime.get(0);
        String end = operateTime.get(1);
        if (start != null && !start.isBlank()) {
            query.setOperateTimeStart(LocalDateTime.parse(start, TIME_FORMATTER));
        }
        if (end != null && !end.isBlank()) {
            query.setOperateTimeEnd(LocalDateTime.parse(end, TIME_FORMATTER));
        }
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

    private String getLoginUsername() {
        Object username = StpUtil.getTokenSession().get("username");
        return username != null ? username.toString() : null;
    }
}
