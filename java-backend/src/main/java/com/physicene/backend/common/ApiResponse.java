package com.physicene.backend.common;

/**
 * 统一响应包装（SRS §6.1）：{code, message, data}。
 * code=0 成功；1xxx 客户端错误；2xxx 服务端错误（错误码体系第三周随 ErrorCode 落地）。
 */
public record ApiResponse<T>(int code, String message, T data) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(0, "ok", data);
    }

    public static ApiResponse<Void> ok() {
        return new ApiResponse<>(0, "ok", null);
    }
}
