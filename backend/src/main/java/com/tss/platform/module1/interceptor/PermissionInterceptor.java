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
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final List<String> PUBLIC_PATHS = Arrays.asList(
            "/api/user/register/username",
            "/api/user/register/mobile",
            "/api/user/sms/code",
            "/api/user/forget/password",
            "/api/user/login"
    );
    private static final List<String> USER_SELF_PATHS = Arrays.asList(
            "/api/user/current-user",
            "/api/user/logout"
    );

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String requestUri = request.getRequestURI();
        SYSTEM_LOG.debug("请求URI: {}", requestUri);

        if (isPublicPath(requestUri)) {
            return true;
        }

        try {
            String token = request.getHeader("Authorization");
            if (token != null && token.startsWith("Bearer ")) {
                token = token.substring(7).trim();
                if (!token.isEmpty()) {
                    StpUtil.setTokenValue(token);
                }
            }
            StpUtil.checkLogin();
        } catch (Exception e) {
            SYSTEM_LOG.warn("Token验证失败: {}", e.getMessage());
            writeResult(response, HttpServletResponse.SC_UNAUTHORIZED, Result.unauthorized("请先登录"));
            return false;
        }

        if (isAdminOnlyPath(requestUri) && !isAdmin()) {
            SYSTEM_LOG.warn("权限验证失败，非管理员: uri={}", requestUri);
            writeResult(response, HttpServletResponse.SC_FORBIDDEN, Result.noAuth("无权限访问，仅管理员可操作"));
            return false;
        }

        return true;
    }

    private void writeResult(HttpServletResponse response, int httpStatus, Result<?> result) throws IOException {
        response.setStatus(httpStatus);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        try (PrintWriter writer = response.getWriter()) {
            writer.write(OBJECT_MAPPER.writeValueAsString(result));
            writer.flush();
        }
    }

    private boolean isPublicPath(String requestUri) {
        return PUBLIC_PATHS.stream().anyMatch(requestUri::startsWith);
    }

    private boolean isAdminOnlyPath(String requestUri) {
        if (!requestUri.startsWith("/api/user") &&
            !requestUri.startsWith("/api/log") &&
            !requestUri.startsWith("/api/role") &&
            !requestUri.startsWith("/api/system/user") &&
            !requestUri.startsWith("/api/system/log")) {
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
            return roleId != null && (roleId == 1 || roleId == 2);
        } catch (Exception e) {
            SYSTEM_LOG.error("isAdmin方法异常: {}", e.getMessage());
            return false;
        }
    }
}
