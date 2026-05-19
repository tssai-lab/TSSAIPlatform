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
    public Result<Map<String, Object>> getUserList() {
        List<Map<String, Object>> list = userService.getUserListWithRole();
        
        // 转换数据格式，确保与前端一致
        for (Map<String, Object> item : list) {
            // 将 mobile 复制到 phone 字段（前端可能使用 phone）
            if (item.containsKey("mobile") && !item.containsKey("phone")) {
                item.put("phone", item.get("mobile"));
            }
            
            // 将 role_name 设置为 role 字段（前端期望的角色名称）
            String roleName = "";
            if (item.containsKey("role_name")) {
                roleName = String.valueOf(item.get("role_name"));
            } else if (item.containsKey("role_id")) {
                Integer roleId = (Integer) item.get("role_id");
                if (roleId == 1) {
                    roleName = "超管";
                } else if (roleId == 2) {
                    roleName = "普通管理员";
                } else {
                    roleName = "普通用户";
                }
            }
            
            // 统一角色名称格式，确保与前端一致
            if ("超级管理员".equals(roleName)) {
                roleName = "超管";
            } else if (!"普通管理员".equals(roleName) && !"普通用户".equals(roleName)) {
                roleName = "普通用户";
            }
            item.put("role", roleName);
            
            // 将 created_at 复制到 createdAt 字段
            if (item.containsKey("created_at") && !item.containsKey("createdAt")) {
                item.put("createdAt", item.get("created_at"));
            }
        }
        
        // 返回前端期望的格式：{ list: [], total: number }
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("total", list.size());
        
        return Result.success(result, "查询成功");
    }

    @PostMapping("/add")
    public Result<?> addUser(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员新增用户请求: username={}",
                DesensitizationUtil.maskUsername(UserRoleUtil.safeString(params.get("username"))));

        try {
            String username = UserRoleUtil.safeString(params.get("username"));
            if (username == null) {
                return Result.fail("用户名不能为空");
            }

            String mobile = UserRoleUtil.safeString(params.get("phone"));
            if (mobile == null) {
                return Result.fail("手机号不能为空");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            Integer roleId = UserRoleUtil.parseRoleId(UserRoleUtil.safeString(params.get("role")));
            Result<?> roleCheck = validateRoleAssignment(currentRoleId, roleId, null);
            if (roleCheck != null) {
                return roleCheck;
            }

            LambdaQueryWrapper<User> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(User::getUsername, username);
            checkWrapper.isNull(User::getDeletedAt);
            if (userService.count(checkWrapper) > 0) {
                return Result.fail("用户名已存在");
            }

            LambdaQueryWrapper<User> mobileCheckWrapper = new LambdaQueryWrapper<>();
            mobileCheckWrapper.eq(User::getMobile, mobile);
            mobileCheckWrapper.isNull(User::getDeletedAt);
            if (userService.count(mobileCheckWrapper) > 0) {
                return Result.fail("该手机号码已被使用");
            }

            // 按用户名恢复已软删账号
            LambdaQueryWrapper<User> deletedByUsernameWrapper = new LambdaQueryWrapper<>();
            deletedByUsernameWrapper.eq(User::getUsername, username);
            deletedByUsernameWrapper.isNotNull(User::getDeletedAt);
            User deletedUser = userService.getOne(deletedByUsernameWrapper);
            if (deletedUser != null) {
                Result<?> mobileConflict = checkMobileAvailable(mobile, deletedUser.getId());
                if (mobileConflict != null) {
                    return mobileConflict;
                }
                return restoreDeletedUser(deletedUser, username, mobile, roleId, params);
            }

            // 手机号被已软删账号占用（唯一索引含 deleted 记录），恢复该账号而非 INSERT
            LambdaQueryWrapper<User> deletedByMobileWrapper = new LambdaQueryWrapper<>();
            deletedByMobileWrapper.eq(User::getMobile, mobile);
            deletedByMobileWrapper.isNotNull(User::getDeletedAt);
            User deletedByMobile = userService.getOne(deletedByMobileWrapper);
            if (deletedByMobile != null) {
                LambdaQueryWrapper<User> usernameActiveWrapper = new LambdaQueryWrapper<>();
                usernameActiveWrapper.eq(User::getUsername, username);
                usernameActiveWrapper.isNull(User::getDeletedAt);
                usernameActiveWrapper.ne(User::getId, deletedByMobile.getId());
                if (userService.count(usernameActiveWrapper) > 0) {
                    return Result.fail("用户名已存在");
                }
                return restoreDeletedUser(deletedByMobile, username, mobile, roleId, params);
            }

            User user = new User();
            user.setUsername(username);
            user.setMobile(mobile);
            user.setRoleId(roleId);
            user.setStatus(UserRoleUtil.isEnabledStatus(UserRoleUtil.safeString(params.get("status"))));
            user.setPassword(BCrypt.hashpw("123456", BCrypt.gensalt()));
            user.setEmail(username + "@default.com");
            user.setCreatedAt(LocalDateTime.now());
            user.setUpdatedAt(LocalDateTime.now());

            if (userService.save(user)) {
                SYSTEM_LOG.info("管理员新增用户成功: username={}", DesensitizationUtil.maskUsername(username));
                return Result.success(null, "新增用户成功");
            }
            return Result.fail("新增失败");
        } catch (Exception e) {
            SYSTEM_LOG.error("管理员新增用户异常: error={}", e.getMessage());
            String errMsg = e.getMessage() != null ? e.getMessage() : "";
            if (errMsg.contains("uk_users_mobile")) {
                return Result.fail("该手机号码已被使用（含历史已删除账号），请更换手机号或联系管理员");
            }
            if (errMsg.contains("uk_users_username") || errMsg.contains("users_username")) {
                return Result.fail("用户名已存在");
            }
            return Result.fail("新增失败，请检查用户名和手机号是否已被占用");
        }
    }

    private Result<?> restoreDeletedUser(User deletedUser, String username, String mobile, Integer roleId,
                                       Map<String, Object> params) {
        boolean status = UserRoleUtil.isEnabledStatus(UserRoleUtil.safeString(params.get("status")));
        String passwordHash = BCrypt.hashpw("123456", BCrypt.gensalt());
        String email = username + "@default.com";

        boolean ok = userService.restoreDeletedUser(
                deletedUser, username, mobile, roleId, status, passwordHash, email);
        if (!ok) {
            return Result.fail("恢复用户失败");
        }
        SYSTEM_LOG.info("管理员恢复已删除用户: username={}, userId={}",
                DesensitizationUtil.maskUsername(username), deletedUser.getId());
        return Result.success(null, "用户已恢复");
    }

    @PutMapping("/edit")
    public Result<?> editUser(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        Integer userId = params.get("id") != null ? Integer.parseInt(String.valueOf(params.get("id"))) : null;
        if (userId == null) {
            return Result.fail("用户ID不能为空");
        }

        SYSTEM_LOG.info("管理员编辑用户请求: userId={}, params={}", userId, params);

        try {
            User user = userService.getById(userId);
            if (user == null || user.getDeletedAt() != null) {
                throw new IllegalArgumentException("用户不存在");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            Integer targetRoleId = user.getRoleId();

            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            if (currentRoleId.equals(2) && targetRoleId != 3) {
                SYSTEM_LOG.warn("普通管理员尝试编辑非普通用户: currentUserId={}, targetUserId={}, targetRoleId={}",
                        StpUtil.getLoginIdAsInt(), userId, targetRoleId);
                return Result.fail("普通管理员只能编辑普通用户");
            }

            String newUsername = UserRoleUtil.safeString(params.get("username"));
            if (newUsername != null) {
                Result<?> dup = checkUsernameAvailable(newUsername, userId);
                if (dup != null) {
                    return dup;
                }
                user.setUsername(newUsername);
            }

            String newMobile = UserRoleUtil.safeString(params.get("phone"));
            if (newMobile != null) {
                Result<?> dup = checkMobileAvailable(newMobile, userId);
                if (dup != null) {
                    return dup;
                }
                user.setMobile(newMobile);
            }

            if (params.get("role") != null) {
                Integer newRoleId = UserRoleUtil.parseRoleId(UserRoleUtil.safeString(params.get("role")));
                Result<?> roleCheck = validateRoleAssignment(currentRoleId, newRoleId, targetRoleId);
                if (roleCheck != null) {
                    return roleCheck;
                }
                user.setRoleId(newRoleId);
            }

            if (params.get("status") != null) {
                user.setStatus(UserRoleUtil.isEnabledStatus(UserRoleUtil.safeString(params.get("status"))));
            }

            user.setUpdatedAt(LocalDateTime.now());

            boolean success = userService.updateById(user);
            if (success) {
                SYSTEM_LOG.info("管理员编辑用户成功: userId={}", userId);
                return Result.success(null, "更新成功");
            } else {
                SYSTEM_LOG.error("管理员编辑用户失败: userId={}", userId);
                return Result.fail("更新失败");
            }
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            SYSTEM_LOG.error("管理员编辑用户异常: userId={}, error={}", userId, e.getMessage());
            return Result.fail("更新失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/delete")
    public Result<?> deleteUser(@RequestParam Integer id, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员删除用户请求: userId={}", id);

        try {
            User targetUser = userService.getById(id);
            if (targetUser == null || targetUser.getDeletedAt() != null) {
                return Result.fail("用户不存在");
            }

            int currentUserId = StpUtil.getLoginIdAsInt();
            if (currentUserId == id) {
                return Result.fail("不能删除当前登录账号");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            Integer targetRoleId = targetUser.getRoleId();

            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            if (currentRoleId.equals(2) && targetRoleId != 3) {
                SYSTEM_LOG.warn("普通管理员尝试删除非普通用户: currentUserId={}, targetUserId={}, targetRoleId={}",
                        currentUserId, id, targetRoleId);
                return Result.fail("普通管理员只能删除普通用户");
            }

            if (!currentRoleId.equals(1) && targetRoleId != null && targetRoleId != 3) {
                return Result.fail("仅超级管理员可删除管理员账号");
            }

            boolean success = userService.softDeleteUser(id);
            if (success) {
                SYSTEM_LOG.info("管理员删除用户成功: userId={}", id);
                return Result.success(null, "删除成功");
            } else {
                SYSTEM_LOG.error("管理员删除用户失败: userId={}", id);
                return Result.fail("删除失败");
            }
        } catch (Exception e) {
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

        try {
            User user = userService.getById(userId);
            if (user == null || user.getDeletedAt() != null) {
                throw new IllegalArgumentException("用户不存在");
            }

            Integer currentRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
            Integer targetRoleId = user.getRoleId();

            if (currentRoleId == null) {
                return Result.fail("未获取到当前用户角色");
            }

            if (currentRoleId.equals(2) && targetRoleId != 3) {
                SYSTEM_LOG.warn("普通管理员尝试切换非普通用户状态: currentUserId={}, targetUserId={}, targetRoleId={}",
                        StpUtil.getLoginIdAsInt(), userId, targetRoleId);
                return Result.fail("普通管理员只能切换普通用户状态");
            }

            boolean status = UserRoleUtil.isEnabledStatus(statusStr);
            user.setStatus(status);
            user.setUpdatedAt(LocalDateTime.now());
            
            boolean success = userService.updateById(user);
            if (success) {
                SYSTEM_LOG.info("管理员切换用户状态成功: userId={}", userId);
                return Result.success(null, "状态更新成功");
            } else {
                return Result.fail("状态更新失败");
            }
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
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

        // 只检查未删除的用户
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(User::getUsername, username.trim());
        wrapper.isNull(User::getDeletedAt);
        long count = userService.count(wrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("available", count == 0);
        return Result.success(result, "查询成功");
    }

    /** 校验角色分配权限；通过返回 null */
    private Result<?> validateRoleAssignment(Integer currentRoleId, Integer newRoleId, Integer targetRoleId) {
        if (newRoleId == null) {
            newRoleId = 3;
        }
        if (currentRoleId.equals(2)) {
            if (newRoleId != 3) {
                return Result.fail("普通管理员只能创建或编辑普通用户");
            }
            return null;
        }
        if (!currentRoleId.equals(1)) {
            return Result.fail("无权限分配该角色");
        }
        if (newRoleId == 1 && !Integer.valueOf(1).equals(targetRoleId)) {
            return Result.fail("不支持创建或提升为超级管理员");
        }
        return null;
    }

    private Result<?> checkUsernameAvailable(String username, Integer excludeUserId) {
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(User::getUsername, username);
        wrapper.isNull(User::getDeletedAt);
        if (excludeUserId != null) {
            wrapper.ne(User::getId, excludeUserId);
        }
        if (userService.count(wrapper) > 0) {
            return Result.fail("用户名已存在");
        }
        return null;
    }

    private Result<?> checkMobileAvailable(String mobile, Integer excludeUserId) {
        LambdaQueryWrapper<User> activeWrapper = new LambdaQueryWrapper<>();
        activeWrapper.eq(User::getMobile, mobile);
        activeWrapper.isNull(User::getDeletedAt);
        if (excludeUserId != null) {
            activeWrapper.ne(User::getId, excludeUserId);
        }
        if (userService.count(activeWrapper) > 0) {
            return Result.fail("该手机号码已被使用");
        }
        // 唯一索引包含已软删记录，需排除「正在恢复」的账号本身
        LambdaQueryWrapper<User> anyWrapper = new LambdaQueryWrapper<>();
        anyWrapper.eq(User::getMobile, mobile);
        if (excludeUserId != null) {
            anyWrapper.ne(User::getId, excludeUserId);
        }
        if (userService.count(anyWrapper) > 0) {
            return Result.fail("该手机号码已被使用（含历史已删除账号）");
        }
        return null;
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

