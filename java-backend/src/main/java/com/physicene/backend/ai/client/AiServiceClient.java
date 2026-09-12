package com.physicene.backend.ai.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

import java.util.Map;

/**
 * Python AI 服务 Feign 客户端（Java 调 Python 的唯一出口，SRS §6.2）。
 * 第一周仅接入 /health；/agent/* 与 /ocr/* 第四、五周补齐。
 */
@FeignClient(name = "aiService", url = "${ai.service.url:http://localhost:8000}")
public interface AiServiceClient {

    /** 健康检查：{status, components:{chroma, bge_m3_model, paddle_ocr}}，不查 DeepSeek */
    @GetMapping("/health")
    Map<String, Object> health();
}
