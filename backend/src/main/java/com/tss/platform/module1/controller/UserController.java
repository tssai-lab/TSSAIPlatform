package com.tss.platform.module1.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.dto.UserRegisterDTO;
import com.tss.platform.module1.dto.SmsCodeDTO;
import com.tss.platform.module1.dto.LoginDTO;
import com.tss.platform.module1.dto.ForgetPasswordDTO;
import com.tss.platform.module1.dto.ResetPasswordDTO;
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
import org.springframework.web.bind.annotation.*;

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

    @PostMapping("/add")
    public Result<?> addUser(@RequestBody User user, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员新增用户请求: username={}", DesensitizationUtil.maskUsername(user.getUsername()));
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setUserName(user.getUsername() != null ? user.getUsername() : "unknown");
        opLog.setOperationType("add");
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
    public Result<?> resetPassword(@RequestBody ResetPasswordDTO dto, HttpServletRequest request) {
        if (dto.getUserId() == null) {
            SYSTEM_LOG.warn("管理员重置密码请求: userId为空");
            return Result.fail("用户ID不能为空");
        }
        
        SYSTEM_LOG.info("管理员重置密码请求: userId={}", dto.getUserId());
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("reset");
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

    @DeleteMapping("/delete/{userId}")
    public Result<?> softDeleteUser(@PathVariable Integer userId, HttpServletRequest request) {
        SYSTEM_LOG.info("管理员删除用户请求: userId={}", userId);
        
        String ip = getClientIp(request);
        OperationLog opLog = new OperationLog();
        opLog.setUserId(StpUtil.getLoginIdAsInt());
        opLog.setOperationType("delete");
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
            SYSTEM_LOG.info("验证码发送成功: mobile={}, code={}", DesensitizationUtil.maskMobile(dto.getMobile()), code);
            USER_LOG.info("验证码发送成功: mobile={}", DesensitizationUtil.maskMobile(dto.getMobile()));
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
            userService.registerByMobile(dto);
            return Result.success(null, "注册成功");
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
            StpUtil.logout();
            return Result.success("退出登录成功");
        } catch (Exception e) {
            return Result.success("退出登录成功");
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
            if (user == null) {
                return Result.fail("用户不存在");
            }
            Map<String, Object> data = new java.util.HashMap<>();
            data.put("id", user.getId());
            data.put("username", user.getUsername());
            data.put("mobile", user.getMobile());
            data.put("roleId", user.getRoleId());
            data.put("status", user.getStatus());
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
