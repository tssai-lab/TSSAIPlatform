
package com.tss.platform.module1.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.dto.*;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.entity.User;
import com.tss.platform.module1.service.OperationLogService;
import com.tss.platform.module1.service.UserService;
import com.tss.platform.module1.util.SmsCodeUtil;
import com.tss.platform.module1.util.DesensitizationUtil;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private static final Logger SYSTEM_LOG = LoggerFactory.getLogger("SYSTEM_LOG");
    private static final Logger USER_LOG = LoggerFactory.getLogger("USER_LOG");

    @Resource
    private UserService userService;

    @Resource
    private SmsCodeUtil smsCodeUtil;

    @Resource
    private OperationLogService operationLogService;

    /** 开发环境将验证码写入日志并在接口中返回（生产环境请设为 false） */
    @Value("${sms.expose-code:true}")
    private boolean smsExposeCode;

    @PostMapping("/add")
    public Result<?> addUser(@RequestBody User user, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员新增用户请求: username={}", DesensitizationUtil.maskUsername(user.getUsername()));
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setUserName(user.getUsername() != null ? user.getUsername() : "unknown");
        opLog.setOperationType("1");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员后台新增用户: " + DesensitizationUtil.maskUsername(user.getUsername()));

        try {
            boolean success = userService.addUser(user);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员新增用户成功: username={}", DesensitizationUtil.maskUsername(user.getUsername()));
                return Result.success(null, "新增用户成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员新增用户失败: username={}", DesensitizationUtil.maskUsername(user.getUsername()));
                return Result.fail("新增失败");
            }
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员新增用户异常: username={}, error={}", DesensitizationUtil.maskUsername(user.getUsername()), e.getMessage());
            return Result.fail("新增失败: " + e.getMessage());
        }
    }

    @PostMapping("/reset-password")
    public Result<?> resetPassword(@Valid @RequestBody ResetPasswordDTO dto, HttpServletRequest request) {
        if (dto.getUserId() == null) {
            SYSTEM_LOG.warn("管理员重置密码请求: userId为空");
            return Result.fail("用户ID不能为空");
        }
        
        SYSTEM_LOG.info("管理员重置密码请求: userId={}", dto.getUserId());
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("4");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员重置用户密码, userId=" + dto.getUserId());

        try {
            boolean success = userService.resetPassword(dto.getUserId(), dto.getNewPassword());
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员重置密码成功: userId={}", dto.getUserId());
                return Result.success(null, "密码重置成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员重置密码失败: userId={}", dto.getUserId());
                return Result.fail("重置失败");
            }
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员重置密码异常: userId={}, error={}", dto.getUserId(), e.getMessage());
            return Result.fail("重置失败: " + e.getMessage());
        }
    }

    @GetMapping("/list")
    public Result<List<Map<String, Object>>> getUserListWithRole() {
        List<Map<String, Object>> list = userService.getUserListWithRole();
        return Result.success(list, "查询成功");
    }

    @PostMapping("/page")
    public Result<PageResultDTO<Map<String, Object>>> getUserPage(@RequestBody UserQueryDTO queryDTO) {
        if (queryDTO.getPage() == null || queryDTO.getPage() < 1) {
            queryDTO.setPage(1);
        }
        if (queryDTO.getSize() == null || queryDTO.getSize() < 1) {
            queryDTO.setSize(10);
        }
        
        IPage<Map<String, Object>> pageResult = userService.getUserPage(queryDTO);
        
        PageResultDTO<Map<String, Object>> result = new PageResultDTO<>(
            pageResult.getRecords(),
            pageResult.getTotal(),
            queryDTO.getPage(),
            queryDTO.getSize()
        );
        
        return Result.success(result, "查询成功");
    }

    @GetMapping("/detail/{userId}")
    public Result<Map<String, Object>> getUserDetail(@PathVariable Integer userId) {
        Map<String, Object> userDetail = userService.getUserDetail(userId);
        if (userDetail == null) {
            return Result.fail("用户不存在");
        }
        return Result.success(userDetail, "查询成功");
    }

    @PutMapping("/update")
    public Result<?> updateUser(@RequestBody UserUpdateDTO updateDTO, HttpServletRequest request) {
        if (updateDTO.getUserId() == null) {
            return Result.fail("用户ID不能为空");
        }
        
        SYSTEM_LOG.info("管理员编辑用户请求: userId={}", updateDTO.getUserId());
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("3");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员编辑用户信息, userId=" + updateDTO.getUserId());

        try {
            boolean success = userService.updateUser(updateDTO);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员编辑用户成功: userId={}", updateDTO.getUserId());
                return Result.success(null, "更新成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员编辑用户失败: userId={}", updateDTO.getUserId());
                return Result.fail("更新失败");
            }
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员编辑用户异常: userId={}, error={}", updateDTO.getUserId(), e.getMessage());
            return Result.fail("更新失败: " + e.getMessage());
        }
    }

    @PutMapping("/status/{userId}")
    public Result<?> toggleUserStatus(@PathVariable Integer userId, @RequestParam Boolean status, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员切换用户状态请求: userId={}, status={}", userId, status);
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("3");
        opLog.setOperationObj("users");
        opLog.setRemarks("管理员切换用户状态, userId=" + userId + ", status=" + status);

        try {
            boolean success = userService.toggleUserStatus(userId, status);
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

    @DeleteMapping("/delete/{userId}")
    public Result<?> softDeleteUser(@PathVariable Integer userId, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员删除用户请求: userId={}", userId);
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("2");
        opLog.setOperationObj("users");
        opLog.setIpAddress(ip);
        opLog.setRemarks("管理员软删除用户, userId=" + userId);

        try {
            boolean success = userService.softDeleteUser(userId);
            if (success) {
                opLog.setStatus("SUCCESS");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.info("管理员删除用户成功: userId={}", userId);
                return Result.success(null, "删除成功");
            } else {
                opLog.setStatus("FAIL");
                operationLogService.recordLog(opLog);
                SYSTEM_LOG.error("管理员删除用户失败: userId={}", userId);
                return Result.fail("删除失败");
            }
        } catch (Exception e) {
            opLog.setStatus("FAIL");
            operationLogService.recordLog(opLog);
            SYSTEM_LOG.error("管理员删除用户异常: userId={}, error={}", userId, e.getMessage());
            return Result.fail("删除失败: " + e.getMessage());
        }
    }

    @PostMapping("/register/username")
    public Result<?> registerByUsername(@Valid @RequestBody UserRegisterDTO dto) {
        USER_LOG.info("注册请求: username={}", DesensitizationUtil.maskUsername(dto.getUsername()));
        SYSTEM_LOG.debug("注册请求入参: username={}", DesensitizationUtil.maskUsername(dto.getUsername()));
        
        try {
            userService.registerByUsername(dto);
            return Result.success(null, "注册成功");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            return Result.fail("注册失败，请稍后重试");
        }
    }

    @PostMapping("/sms/code")
    public Result<?> sendSmsCode(@Valid @RequestBody SmsCodeDTO dto) {
        if (smsCodeUtil.isLimited(dto.getMobile())) {
            SYSTEM_LOG.warn("验证码频率超限: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
            USER_LOG.warn("验证码发送失败: 频率超限, mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
            return Result.fail("60秒内只能发送一次验证码");
        }
        
        try {
            String code = smsCodeUtil.genCode();
            smsCodeUtil.save(dto.getMobile(), code);
            String mobile = dto.getMobile().trim();
            // 后台日志输出完整验证码，便于开发联调（未接真实短信通道）
            SYSTEM_LOG.info("【短信验证码】手机号={}, 验证码={}, 有效期5分钟", mobile, code);
            USER_LOG.info("【短信验证码】手机号={}, 验证码={}", mobile, code);

            if (smsExposeCode) {
                Map<String, Object> data = new HashMap<>();
                data.put("code", code);
                data.put("mobile", mobile);
                data.put("expireSeconds", 300);
                return Result.success(data, "验证码发送成功（开发模式，验证码见后台日志）");
            }
            return Result.success(null, "验证码发送成功");
        } catch (Exception e) {
            SYSTEM_LOG.error("验证码发送失败(系统异常): mobile={}, error={}", DesensitizationUtil.maskMobile(dto.getMobile()), e.getMessage());
            USER_LOG.error("验证码发送失败: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
            return Result.fail("验证码发送失败");
        }
    }

    @PostMapping("/register/mobile")
    public Result<?> registerByMobile(@Valid @RequestBody UserRegisterDTO dto) {
        USER_LOG.info("手机号注册请求: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
        SYSTEM_LOG.debug("手机号注册请求入参: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
        
        try {
            if (dto.getSmsCode() == null || dto.getSmsCode().isBlank()) {
                SYSTEM_LOG.warn("验证码为空: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
                USER_LOG.warn("注册失败: 验证码为空, mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
                return Result.fail("验证码不能为空");
            }
            boolean ok = userService.registerByMobile(dto);
            if (!ok) {
                return Result.fail("注册失败");
            }
            Map<String, Object> data = new HashMap<>();
            String username = dto.getUsername() != null && !dto.getUsername().isBlank()
                    ? dto.getUsername().trim()
                    : dto.getMobile().trim();
            data.put("username", username);
            data.put("mobile", dto.getMobile().trim());
            return Result.success(data, "注册成功");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            return Result.fail("注册失败，请稍后重试");
        }
    }

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody LoginDTO dto) {
        if ("account".equals(dto.getType())) {
            USER_LOG.info("登录请求: username={}", DesensitizationUtil.maskUsername(dto.getUsername()));
            SYSTEM_LOG.debug("登录请求入参: username={}", DesensitizationUtil.maskUsername(dto.getUsername()));
        } else if ("mobile".equals(dto.getType())) {
            USER_LOG.info("登录请求: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
            SYSTEM_LOG.debug("登录请求入参: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
        } else {
            USER_LOG.info("登录请求: type={}", dto.getType());
            SYSTEM_LOG.debug("登录请求入参: type={}", dto.getType());
        }

        try {
            Map<String, Object> data = userService.login(dto);
            return Result.success(data, "登录成功");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            return Result.fail("登录失败，请稍后重试");
        }
    }

    @PostMapping("/logout")
    public Result<?> logout() {
        try {
            if (StpUtil.isLogin()) {
                StpUtil.logout();
            }
        } catch (Exception e) {
            SYSTEM_LOG.warn("退出登录异常: {}", e.getMessage());
        }
        return Result.success("退出登录成功");
    }

    /**
     * 超级管理员将普通用户提升为普通管理员（role_id 3 → 2）
     */
    @PostMapping("/promote-to-admin")
    public Result<?> promoteToNormalAdmin(@RequestBody Map<String, Integer> body) {
        Integer operatorRoleId = (Integer) StpUtil.getTokenSession().get("roleId");
        if (operatorRoleId == null || operatorRoleId != 1) {
            return Result.fail("仅超级管理员可操作");
        }
        Integer userId = body != null ? body.get("userId") : null;
        if (userId == null) {
            return Result.fail("用户ID不能为空");
        }
        USER_LOG.info("超级管理员晋升普通管理员: targetUserId={}", userId);
        try {
            userService.promoteToNormalAdmin(userId);
            return Result.success(null, "已设为普通管理员");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            SYSTEM_LOG.error("晋升管理员异常: userId={}, error={}", userId, e.getMessage());
            return Result.fail("操作失败，请稍后重试");
        }
    }

    @PostMapping("/forget/password")
    public Result<?> forgetPassword(@Valid @RequestBody ForgetPasswordDTO dto) {
        USER_LOG.info("忘记密码请求: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
        
        try {
            userService.forgetPassword(dto);
            return Result.success("密码重置成功，请使用新密码登录");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            return Result.fail("密码重置失败，请稍后重试");
        }
    }

    @GetMapping("/current-user")
    public Result<Map<String, Object>> getCurrentUser() {
        try {
            Integer userId = StpUtil.getLoginIdAsInt();
            User user = userService.getById(userId);
            if (user == null || user.getDeletedAt() != null) {
                return Result.unauthorized("用户不存在或已失效");
            }
            if (user.getStatus() != null && !user.getStatus()) {
                return Result.fail("账号已被禁用");
            }
            Map<String, Object> data = new java.util.HashMap<>();
            data.put("id", user.getId());
            data.put("username", user.getUsername());
            data.put("mobile", user.getMobile());
            data.put("roleId", user.getRoleId());
            data.put("status", user.getStatus());
            
            // 添加 role 字段，用于前端权限判断
            Integer roleId = user.getRoleId();
            String role;
            if (roleId == 1) {
                role = "super_admin";
            } else if (roleId == 2) {
                role = "normal_admin";
            } else {
                role = "user";
            }
            data.put("role", role);
            
            return Result.success(data, "获取当前用户成功");
        } catch (Exception e) {
            return Result.fail("获取当前用户失败");
        }
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
