package com.tss.platform.module1.common;

import lombok.Data;

/**
 * 全局统一响应结果类
 * @param <T> 响应数据类型
 */
@Data
public class Result<T> {
    // ========== 1. 定义通用状态码常量（避免硬编码，便于维护） ==========
    /** 成功 */
    public static final Integer SUCCESS_CODE = 200;
    /** 业务失败 */
    public static final Integer FAIL_CODE = 400;
    /** 无权限 */
    public static final Integer NO_AUTH_CODE = 403;
    /** 未登录/令牌失效 */
    public static final Integer UNAUTHORIZED_CODE = 401;
    /** 服务器内部错误 */
    public static final Integer SERVER_ERROR_CODE = 500;

    // ========== 2. 响应字段（保持原有核心字段，补充注释） ==========
    /** 状态码 */
    private Integer code;
    /** 响应消息 */
    private String message;
    /** 响应数据 */
    private T data;

    // ========== 3. 私有构造器（强制通过静态方法创建，避免随意new） ==========
    private Result() {}

    // ========== 4. 重载success方法（提升灵活性） ==========
    /**
     * 成功响应（无数据，默认消息）
     */
    public static <T> Result<T> success() {
        return success(null, "操作成功");
    }

    /**
     * 成功响应（带数据，默认消息）
     */
    public static <T> Result<T> success(T data) {
        return success(data, "操作成功");
    }

    /**
     * 成功响应（带数据+自定义消息）
     */
    public static <T> Result<T> success(T data, String message) {
        Result<T> result = new Result<>();
        result.setCode(SUCCESS_CODE);
        result.setMessage(message);
        result.setData(data);
        return result;
    }

    // ========== 5. 重载fail方法（覆盖更多场景） ==========
    /**
     * 业务失败响应（自定义消息）
     */
    public static <T> Result<T> fail(String message) {
        Result<T> result = new Result<>();
        result.setCode(FAIL_CODE);
        result.setMessage(message);
        result.setData(null); // 失败时数据置空，规范返回格式
        return result;
    }

    /**
     * 权限不足响应
     */
    public static <T> Result<T> noAuth(String message) {
        Result<T> result = new Result<>();
        result.setCode(NO_AUTH_CODE);
        result.setMessage(message == null ? "暂无操作权限" : message);
        result.setData(null);
        return result;
    }

    /**
     * 未登录/令牌失效响应
     */
    public static <T> Result<T> unauthorized(String message) {
        Result<T> result = new Result<>();
        result.setCode(UNAUTHORIZED_CODE);
        result.setMessage(message == null ? "请先登录" : message);
        result.setData(null);
        return result;
    }

    /**
     * 服务器内部错误响应
     */
    public static <T> Result<T> serverError(String message) {
        Result<T> result = new Result<>();
        result.setCode(SERVER_ERROR_CODE);
        result.setMessage(message == null ? "服务器内部错误" : message);
        result.setData(null);
        return result;
    }
}
