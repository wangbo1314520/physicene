package com.physicene.backend.common.exception;

import org.springframework.http.HttpStatus;

/** 错误码体系（SRS §6.4，13 个）。 */
public enum ErrorCode {

    OK(0, "成功", HttpStatus.OK),
    PARAM_INVALID(1001, "参数无效", HttpStatus.BAD_REQUEST),
    UNAUTHORIZED(1002, "鉴权失败", HttpStatus.UNAUTHORIZED),
    FORBIDDEN(1003, "权限不足", HttpStatus.FORBIDDEN),
    NOT_FOUND(1004, "资源不存在", HttpStatus.NOT_FOUND),
    CONFLICT(1005, "并发冲突", HttpStatus.CONFLICT),
    RATE_LIMITED(1006, "请求过于频繁", HttpStatus.TOO_MANY_REQUESTS),
    INTERNAL(2001, "内部异常", HttpStatus.INTERNAL_SERVER_ERROR),
    EXTERNAL_UNAVAILABLE(2002, "外部服务不可用", HttpStatus.SERVICE_UNAVAILABLE),
    TIMEOUT(2003, "处理超时", HttpStatus.GATEWAY_TIMEOUT),
    DEGRADED(2004, "服务降级", HttpStatus.OK);

    public final int code;
    public final String message;
    public final HttpStatus httpStatus;

    ErrorCode(int code, String message, HttpStatus httpStatus) {
        this.code = code;
        this.message = message;
        this.httpStatus = httpStatus;
    }
}
