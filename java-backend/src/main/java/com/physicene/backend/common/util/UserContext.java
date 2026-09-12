package com.physicene.backend.common.util;

/** 请求级用户上下文（JwtInterceptor 写入，Controller/Service 读取）。 */
public final class UserContext {

    public record AuthUser(Long userId, String username, String role) {
    }

    private static final ThreadLocal<AuthUser> HOLDER = new ThreadLocal<>();

    private UserContext() {
    }

    public static void set(AuthUser user) {
        HOLDER.set(user);
    }

    public static AuthUser get() {
        return HOLDER.get();
    }

    public static Long userId() {
        AuthUser u = HOLDER.get();
        return u == null ? null : u.userId();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
