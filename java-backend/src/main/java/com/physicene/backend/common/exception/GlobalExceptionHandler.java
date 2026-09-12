package com.physicene.backend.common.exception;

import com.physicene.backend.common.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.databind.ObjectMapper;

/** 全局异常 → 统一 {code, message, data}（SRS §6.4 前端处理约定）。 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Object>> business(BusinessException e) {
        return ResponseEntity.status(e.getErrorCode().httpStatus)
                .body(new ApiResponse<>(e.getErrorCode().code, e.getMessage(), e.getData()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            IllegalArgumentException.class})
    public ResponseEntity<ApiResponse<Object>> badRequest(Exception e) {
        return ResponseEntity.badRequest()
                .body(new ApiResponse<>(ErrorCode.PARAM_INVALID.code, "请求参数无效: " + e.getMessage(), null));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Object>> notFound(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus_NOT_FOUND)
                .body(new ApiResponse<>(ErrorCode.NOT_FOUND.code, ErrorCode.NOT_FOUND.message, null));
    }

    private static final org.springframework.http.HttpStatus HttpStatus_NOT_FOUND = org.springframework.http.HttpStatus.NOT_FOUND;

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> internal(Exception e) {
        log.error("未处理异常", e);
        return ResponseEntity.status(ErrorCode.INTERNAL.httpStatus)
                .body(new ApiResponse<>(ErrorCode.INTERNAL.code, ErrorCode.INTERNAL.message, null));
    }
}
