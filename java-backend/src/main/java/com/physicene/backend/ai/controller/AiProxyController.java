package com.physicene.backend.ai.controller;

import com.physicene.backend.ai.client.AiServiceClient;
import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.util.UserContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * AI 服务代理（SD-3）：前端不允许直连 Python，统一经 Java 转发。
 * userId 强制覆盖为 JWT 解析值，防止伪造他人身份调用 Agent 工具。
 */
@RestController
public class AiProxyController {

    private final AiServiceClient aiServiceClient;

    public AiProxyController(AiServiceClient aiServiceClient) {
        this.aiServiceClient = aiServiceClient;
    }

    @GetMapping("/api/ai/health")
    public ApiResponse<Map<String, Object>> aiHealth() {
        return ApiResponse.ok(aiServiceClient.health());
    }

    @PostMapping("/api/v1/agent/chat")
    public ApiResponse<Map<String, Object>> chat(@RequestBody Map<String, Object> body) {
        Map<String, Object> request = new HashMap<>(body);
        request.put("userId", UserContext.userId()); // 强制覆盖（防伪造）
        request.remove("role");
        Map<String, Object> resp = aiServiceClient.agentChat(request);
        return ApiResponse.ok(resp);
    }
}
