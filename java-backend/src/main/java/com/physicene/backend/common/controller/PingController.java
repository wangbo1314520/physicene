package com.physicene.backend.common.controller;

import com.physicene.backend.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * 第一周链路验证接口：三端通信的最小探针。
 * 后续周次保留，用于快速确认 Java 端存活。
 */
@RestController
@RequestMapping("/api")
public class PingController {

    @GetMapping("/ping")
    public ApiResponse<Map<String, Object>> ping() {
        return ApiResponse.ok(Map.of(
                "service", "java-backend",
                "pong", true,
                "time", Instant.now().toString()
        ));
    }
}
