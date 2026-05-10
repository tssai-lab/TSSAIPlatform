package com.tss.platform.module1.interceptor;

import cn.dev33.satoken.stp.StpUtil;
import com.tss.platform.module1.common.Result;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.List;

@Component
public class PermissionInterceptor implements HandlerInterceptor {

    private static final Logger SYSTEM_LOG = LoggerFactory.getLogger("SYSTEM_LOG");
    private static final Logger USER_LOG = LoggerFactory.getLogger("USER_LOG");

    private static final List<String> PUBLIC_PATHS = Arrays.asList(
            "/api/user/register/username",
            "/api/user/register/mobile",
            "/api/user/sms/code",
            "/api/user/forget/password",
            "/api/user/login",
            "/api/files/health"
    );
    private static final List<String> USER_SELF_PATHS = Arrays.asList(
            "/api/user/current-user",
            "/api/user/logout"
    );

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String requestUri = request.getRequestURI();
        SYSTEM_LOG.info("请求URI: {}", requestUri);

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            SYSTEM_LOG.info("CORS预检请求，直接放行: {}", requestUri);
            return true;
        }

        if (isPublicPath(requestUri)) {
            SYSTEM_LOG.info("公共路径，直接放行: {}", requestUri);
            return true;
        }

        try {
            String token = request.getHeader("Authorization");
            SYSTEM_LOG.info("收到Token: {}", token == null || token.isBlank() ? "no" : "yes");
            // 去掉Bearer前缀
            if (token != null && token.startsWith("Bearer ")) {
                token = token.substring(7);
                // 手动设置Token
                StpUtil.setTokenValue(token);
            }
            StpUtil.checkLogin();
            SYSTEM_LOG.info("Token验证成功");
            SYSTEM_LOG.info("当前登录用户ID: {}", StpUtil.getLoginId());
        } catch (Exception e) {
            SYSTEM_LOG.warn("Token验证失败: {}", e.getMessage());
            response.setContentType("application/json;charset=UTF-8");
            response.setCharacterEncoding("UTF-8");
            response.setStatus(200);
            PrintWriter writer = response.getWriter();
            Result<Void> result = Result.fail("请先登录: " + e.getMessage());
            writer.write(new ObjectMapper().writeValueAsString(result));
            writer.flush();
            writer.close();
            return false;
        }

        if (isAdminOnlyPath(requestUri) && !isAdmin()) {
            SYSTEM_LOG.warn("权限验证失败，非管理员");
            response.setContentType("application/json;charset=UTF-8");
            response.setCharacterEncoding("UTF-8");
            response.setStatus(200);
            PrintWriter writer = response.getWriter();
            Result<Void> result = Result.fail("无权限访问，仅管理员可操作");
            writer.write(new ObjectMapper().writeValueAsString(result));
            writer.flush();
            writer.close();
            return false;
        }

        SYSTEM_LOG.info("权限验证成功，放行请求: {}", requestUri);
        return true;
    }

    private boolean isPublicPath(String requestUri) {
        return PUBLIC_PATHS.stream().anyMatch(requestUri::equals);
    }

    private boolean isAdminOnlyPath(String requestUri) {
        if (!requestUri.startsWith("/api/user")) {
            return false;
        }
        if (isPublicPath(requestUri)) {
            return false;
        }
        return USER_SELF_PATHS.stream().noneMatch(requestUri::startsWith);
    }

    private boolean isAdmin() {
        try {
            Integer roleId = (Integer) StpUtil.getTokenSession().get("roleId");
            if (roleId == null) {
                SYSTEM_LOG.warn("TokenSession中没有roleId");
                return false;
            }
            return roleId == 1 || roleId == 2;
        } catch (Exception e) {
            SYSTEM_LOG.error("isAdmin方法异常: {}", e.getMessage());
            return false;
        }
    }
}
