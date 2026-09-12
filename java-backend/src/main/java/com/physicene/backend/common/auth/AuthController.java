package com.physicene.backend.common.auth;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.JwtUtil;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 认证接口（SRS F1）：
 * 注册 role 白名单 student/teacher（admin 走 SQL 初始化）；
 * 登录成功返回 JWT（7200s）；失败不区分用户名/密码错误。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9_]{4,50}$");
    private static final Pattern PASSWORD_PATTERN = Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d).{8,32}$");

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthController(UserRepository userRepository, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
    }

    public record RegisterRequest(@NotBlank String username, @NotBlank String password,
                                  String role, String name) {
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    @PostMapping("/register")
    public ApiResponse<Map<String, Object>> register(@RequestBody RegisterRequest req) {
        if (!USERNAME_PATTERN.matcher(req.username()).matches()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "用户名须为 4-50 位字母/数字/下划线");
        }
        if (!PASSWORD_PATTERN.matcher(req.password()).matches()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "密码须为 8-32 位且同时包含字母和数字");
        }
        String role = req.role() == null ? "student" : req.role().toLowerCase();
        if (!"student".equals(role) && !"teacher".equals(role)) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "角色仅允许 student/teacher");
        }
        if (userRepository.existsByUsername(req.username())) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "用户名已存在");
        }
        UserEntity user = new UserEntity();
        user.setUsername(req.username());
        user.setPasswordHash(encoder.encode(req.password()));
        user.setRole(UserEntity.Role.valueOf(role.toUpperCase()));
        user.setName(req.name() == null || req.name().isBlank() ? req.username() : req.name());
        userRepository.save(user);
        return ApiResponse.ok(Map.of("id", user.getId(), "role", role));
    }

    @PostMapping("/login")
    public ApiResponse<Map<String, Object>> login(@RequestBody LoginRequest req) {
        UserEntity user = userRepository.findByUsername(req.username()).orElse(null);
        // 统一错误文案：不区分用户名/密码错误（SRS F1 验收标准）
        if (user == null || !encoder.matches(req.password(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "用户名或密码错误");
        }
        String token = jwtUtil.generate(user.getId(), user.getUsername(),
                user.getRole().name().toLowerCase());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", token);
        data.put("expiresIn", jwtUtil.getExpirationSeconds());
        data.put("user", Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "role", user.getRole().name().toLowerCase(),
                "name", user.getName()));
        return ApiResponse.ok(data);
    }
}
