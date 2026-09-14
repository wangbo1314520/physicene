package com.physicene.backend.ai.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

/**
 * Python AI 服务 Feign 客户端（Java 调 Python 的唯一出口，SRS §6.2）。
 * 第四周接入 /agent/chat；OCR/RAG 第五周补齐。
 */
@FeignClient(name = "aiService", url = "${ai.service.url:http://localhost:8000}",
        configuration = AiRequestInterceptor.class)
public interface AiServiceClient {

    /** 健康检查：{status, components:{chroma, bge_m3_model, paddle_ocr}}，不查 DeepSeek */
    @GetMapping("/health")
    Map<String, Object> health();

    /** Agent 对话（30s 超时在 feign 配置；请求体契约 ChatRequest camelCase） */
    @PostMapping("/agent/chat")
    Map<String, Object> agentChat(@RequestBody Map<String, Object> request);

    /** OCR 图片识别（20s；低置信度 422 → Java 层降级 2004） */
    @PostMapping("/ocr/recognize")
    Map<String, Object> recognize(@RequestBody Map<String, Object> request);

    /** OCR 文本两步解析 → simType + recommendedElements（20s） */
    @PostMapping("/agent/parse-question")
    Map<String, Object> parseQuestion(@RequestBody Map<String, Object> request);
}
