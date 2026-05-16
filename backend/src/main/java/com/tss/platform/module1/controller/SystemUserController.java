package com.tss.platform.module1.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.entity.User;
import com.tss.platform.module1.service.OperationLogService;
import com.tss.platform.module1.service.UserService;
import com.tss.platform.module1.util.DesensitizationUtil;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.mindrot.jbcrypt.BCrypt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/system/user")
public class SystemUserController {

    private static final Logger SYSTEM_LOG = LoggerFactory.getLogger("SYSTEM_LOG");
    private static final Logger USER_LOG = LoggerFactory.getLogger("USER_LOG");

    @Resource
    private UserService userService;

    @Resource
    private OperationLogService operationLogService;

    @GetMapping("/list")
    public Result<List<Map<String, Object>>> getUserList() {
        List<Map<String, Object>> list = userService.getUserListWithRole();
        return Result.success(list, "查询成功");
    }

    @PostMapping("/add")
    public Result<?> addUser(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员新增用户请求: params={}", params);

        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setUserName(params.get("username") != null ? String.valueOf(params.get("username")) : "unknown");
        opLog.setOperationType("新增");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员后台新增用户: " + DesensitizationUtil.maskUsername(String.valueOf(params.get("username"))));

        try {
            User user = new User();
            user.setUsername(String.valueOf(params.get("username")));
            user.setMobile(String.valueOf(params.get("phone")));
            
            // 处理角色
            String roleStr = String.valueOf(params.get("role"));
            Integer roleId = 3; // 默认普通用户
            if ("super_admin".equals(roleStr) || "超级管理员".equals(roleStr)) {
                roleId = 1;
            } else if ("normal_admin".equals(roleStr) || "普通管理员".equals(roleStr)) {
                roleId = 2;
            } else {
                roleId = 3;
            }
            user.setRoleId(roleId);
            
            // 处理状态
            String statusStr = String.valueOf(params.get("status"));
            user.setStatus("enabled".equals(statusStr) || "启用".equals(statusStr));
            
            // 生成默认密码
            user.setPassword(BCrypt.hashpw("123456", BCrypt.gensalt()));
            user.setEmail(String.valueOf(params.get("username")) + "@default.com");
            user.setCreatedAt(LocalDateTime.now());
            user.setUpdatedAt(LocalDateTime.now());

            boolean success = userService.save(user);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员新增用户成功: username={}", DesensitizationUtil.maskUsername(String.valueOf(params.get("username"))));
                return Result.success(null, "新增用户成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员新增用户失败: username={}", DesensitizationUtil.maskUsername(String.valueOf(params.get("username"))));
                return Result.fail("新增失败");
            }
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员新增用户异常: username={}, error={}", DesensitizationUtil.maskUsername(String.valueOf(params.get("username"))), e.getMessage());
            return Result.fail("新增失败: " + e.getMessage());
        }
    }

    @PutMapping("/edit")
    public Result<?> editUser(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        Integer userId = params.get("id") != null ? Integer.parseInt(String.valueOf(params.get("id"))) : null;
        if (userId == null) {
            return Result.fail("用户ID不能为空");
        }

        SYSTEM_LOG.info("管理员编辑用户请求: userId={}, params={}", userId, params);

        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("修改");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员编辑用户信息, userId=" + userId);

        try {
            User user = userService.getById(userId);
            if (user == null) {
                throw new IllegalArgumentException("用户不存在");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            Integer targetRoleId = user.getRoleId();

            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            if (currentRoleId.equals(2) && targetRoleId != 3) {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.warn("普通管理员尝试编辑非普通用户: currentUserId={}, targetUserId={}, targetRoleId={}", 
                        StpUtil.getLoginIdAsInt(), userId, targetRoleId);
                return Result.fail("普通管理员只能编辑普通用户");
            }

            if (params.get("username") != null) {
                user.setUsername(String.valueOf(params.get("username")));
            }
            if (params.get("phone") != null) {
                user.setMobile(String.valueOf(params.get("phone")));
            }
            
            // 处理角色
            if (params.get("role") != null) {
                String roleStr = String.valueOf(params.get("role"));
                Integer newRoleId = 3;
                if ("super_admin".equals(roleStr) || "超级管理员".equals(roleStr)) {
                    newRoleId = 1;
                } else if ("normal_admin".equals(roleStr) || "普通管理员".equals(roleStr)) {
                    newRoleId = 2;
                } else {
                    newRoleId = 3;
                }
                
                if (currentRoleId.equals(2) && newRoleId != 3) {
                    opLog.setStatus("FAIL");
                    operationLogService.recordLog(opLog);
                    SYSTEM_LOG.warn("普通管理员尝试提升用户角色: currentUserId={}, targetUserId={}, newRoleId={}", 
                            StpUtil.getLoginIdAsInt(), userId, newRoleId);
                    return Result.fail("普通管理员不能提升用户角色");
                }
                
                user.setRoleId(newRoleId);
            }
            
            // 处理状态
            if (params.get("status") != null) {
                String statusStr = String.valueOf(params.get("status"));
                user.setStatus("enabled".equals(statusStr) || "启用".equals(statusStr));
            }
            
            user.setUpdatedAt(LocalDateTime.now());

            boolean success = userService.updateById(user);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员编辑用户成功: userId={}", userId);
                return Result.success(null, "更新成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员编辑用户失败: userId={}", userId);
                return Result.fail("更新失败");
            }
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员编辑用户异常: userId={}, error={}", userId, e.getMessage());
            return Result.fail("更新失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/delete")
    public Result<?> deleteUser(@RequestParam Integer id, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员删除用户请求: userId={}", id);

        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("删除");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员软删除用户, userId=" + id);

        try {
            User targetUser = userService.getById(id);
            if (targetUser == null) {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                return Result.fail("用户不存在");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            Integer targetRoleId = targetUser.getRoleId();

            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            if (currentRoleId.equals(2) && targetRoleId != 3) {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.warn("普通管理员尝试删除非普通用户: currentUserId={}, targetUserId={}, targetRoleId={}", 
                        StpUtil.getLoginIdAsInt(), id, targetRoleId);
                return Result.fail("普通管理员只能删除普通用户");
            }

            boolean success = userService.softDeleteUser(id);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员删除用户成功: userId={}", id);
                return Result.success(null, "删除成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员删除用户失败: userId={}", id);
                return Result.fail("删除失败");
            }
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员删除用户异常: userId={}, error={}", id, e.getMessage());
            return Result.fail("删除失败: " + e.getMessage());
        }
    }

    @PutMapping("/toggleStatus")
    public Result<?> toggleUserStatus(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        Integer userId = params.get("id") != null ? Integer.parseInt(String.valueOf(params.get("id"))) : null;
        String statusStr = params.get("status") != null ? String.valueOf(params.get("status")) : null;
        
        if (userId == null || statusStr == null) {
            return Result.fail("参数不完整");
        }

        SYSTEM_LOG.info("管理员切换用户状态请求: userId={}, status={}", userId, statusStr);

        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("修改");
        opLog.setOperationObj("users");
        opLog.setRemarks("管理员切换用户状态, userId=" + userId + ", status=" + statusStr);

        try {
            User user = userService.getById(userId);
            if (user == null) {
                throw new IllegalArgumentException("用户不存在");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            Integer targetRoleId = user.getRoleId();

            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            if (currentRoleId.equals(2) && targetRoleId != 3) {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.warn("普通管理员尝试切换非普通用户状态: currentUserId={}, targetUserId={}, targetRoleId={}", 
                        StpUtil.getLoginIdAsInt(), userId, targetRoleId);
                return Result.fail("普通管理员只能切换普通用户状态");
            }
            
            boolean status = "enabled".equals(statusStr) || "启用".equals(statusStr);
            user.setStatus(status);
            user.setUpdatedAt(LocalDateTime.now());
            
            boolean success = userService.updateById(user);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员切换用户状态成功: userId={}", userId);
                return Result.success(null, "状态更新成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                return Result.fail("状态更新失败");
            }
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员切换用户状态异常: userId={}, error={}", userId, e.getMessage());
            return Result.fail("状态更新失败: " + e.getMessage());
        }
    }

    @PostMapping("/checkUsername")
    public Result<Map<String, Object>> checkUsername(@RequestBody Map<String, Object> params) {
        String username = params.get("username") != null ? String.valueOf(params.get("username")) : null;
        if (username == null || username.trim().isEmpty()) {
            return Result.fail("用户名不能为空");
        }

        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(User::getUsername, username.trim());
        long count = userService.count(wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("available", count == 0);
        return Result.success(result, "查询成功");
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}
