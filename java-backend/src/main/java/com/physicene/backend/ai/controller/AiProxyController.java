package com.physicene.backend.ai.controller;

import com.physicene.backend.ai.client.AiServiceClient;
import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * AI 服务代理（SD-3）：前端不允许直连 Python，统一经 Java 转发。
 * userId 强制覆盖为 JWT 解析值，防止伪造他人身份调用 Agent 工具。
 * 限流（阶段 A2 · 2026-10-11）：每学生日配额 + 全局并发上限，超额显式拒绝
 * （RATE_LIMITED 1006 + 明确文案，前端原样展示——不静默）。
 */
@RestController
public class AiProxyController {

    private static final Logger log = LoggerFactory.getLogger(AiProxyController.class);

    private final AiServiceClient aiServiceClient;
    private final AgentRateLimiter rateLimiter;
    private final int dailyQuota;

    public AiProxyController(AiServiceClient aiServiceClient, AgentRateLimiter rateLimiter,
                             @Value("${agent.daily-quota:100}") int dailyQuota) {
        this.aiServiceClient = aiServiceClient;
        this.rateLimiter = rateLimiter;
        this.dailyQuota = dailyQuota;
    }

    @GetMapping("/api/ai/health")
    public ApiResponse<Map<String, Object>> aiHealth() {
        return ApiResponse.ok(aiServiceClient.health());
    }

    @PostMapping("/api/v1/agent/chat")
    public ApiResponse<Map<String, Object>> chat(@RequestBody Map<String, Object> body) {
        Long uid = UserContext.userId();
        AgentRateLimiter.Deny deny = rateLimiter.acquire(uid);
        if (deny == AgentRateLimiter.Deny.QUOTA) {
            log.warn("AI 日配额已满 user={} {}", uid, rateLimiter.snapshot());
            throw new BusinessException(ErrorCode.RATE_LIMITED,
                    "今日 AI 额度已用完（每学生每日 " + dailyQuota + " 次，明日自动重置）——"
                            + "仍可使用「直接讲解」内置内容与解题模板，或明日再问");
        }
        if (deny == AgentRateLimiter.Deny.BUSY) {
            throw new BusinessException(ErrorCode.RATE_LIMITED,
                    "AI 正忙（并发已满），请几秒后重试");
        }
        try {
            Map<String, Object> request = new HashMap<>(body);
            request.put("userId", uid); // 强制覆盖（防伪造，SD-3）
            Map<String, Object> resp = aiServiceClient.agentChat(request);
            return ApiResponse.ok(resp);
        } finally {
            rateLimiter.release();
        }
    }
}
