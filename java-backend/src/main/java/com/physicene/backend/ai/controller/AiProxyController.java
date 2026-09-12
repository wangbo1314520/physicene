package com.physicene.backend.ai.controller;

import com.physicene.backend.ai.client.AiServiceClient;
import com.physicene.backend.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * AI 服务代理：前端不允许直连 Python，统一经 Java 转发（部署图 L2/L3 约束）。
 * 第一周验证 /api/ai/health 链路；正式的鉴权/X-Internal-Key/熔断第四周补。
 */
@RestController
@RequestMapping("/api/ai")
public class AiProxyController {

    private final AiServiceClient aiServiceClient;

    public AiProxyController(AiServiceClient aiServiceClient) {
        this.aiServiceClient = aiServiceClient;
    }

    @GetMapping("/health")
    public ApiResponse<Map<String, Object>> aiHealth() {
        return ApiResponse.ok(aiServiceClient.health());
    }
}
