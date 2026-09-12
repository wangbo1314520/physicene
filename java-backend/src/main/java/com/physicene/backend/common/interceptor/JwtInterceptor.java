package com.physicene.backend.common.interceptor;

import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.JwtUtil;
import com.physicene.backend.common.util.UserContext;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * REST 鉴权拦截器（SRS F1 + 4.2）：
 * ① 浏览器请求：Authorization Bearer JWT（未登录 1002 跳 /login）
 * ② Python 内部调用：X-Internal-Key 共享密钥 + X-User-Id（Agent 工具回调 Java）
 */
@Component
public class JwtInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final String internalKey;

    public JwtInterceptor(JwtUtil jwtUtil,
                          @Value("${ai.internal-key}") String internalKey) {
        this.jwtUtil = jwtUtil;
        this.internalKey = internalKey;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true; // CORS 预检放行
        }

        // 内部服务调用（Python Agent 工具 → Java）
        String key = request.getHeader("X-Internal-Key");
        if (key != null && key.equals(internalKey)) {
            String uid = request.getHeader("X-User-Id");
            UserContext.set(new UserContext.AuthUser(
                    uid == null ? null : Long.valueOf(uid), "internal", "student"));
            return true;
        }

        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "缺少令牌");
        }
        try {
            UserContext.set(jwtUtil.parse(header.substring(7)));
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "令牌无效或已过期");
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        UserContext.clear();
    }
}
