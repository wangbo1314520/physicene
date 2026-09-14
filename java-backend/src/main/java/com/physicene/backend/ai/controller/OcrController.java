package com.physicene.backend.ai.controller;

import com.physicene.backend.ai.client.AiServiceClient;
import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.UserContext;
import com.physicene.backend.physics.engine.SceneValidator;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.scene.SceneService;
import feign.FeignException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OCR 拍照识题（SRS F4 / SD-2 半自动建场景）：
 * 上传图片 → Python OCR → 两步解析 → Java validate 二次校验（最后一道防线）
 * → previewToken（15 分钟）→ 前端半透明预览 → 学生确认后 from-preview 建场景（source=ocr）。
 */
@RestController
public class OcrController {

    private static final Logger log = LoggerFactory.getLogger(OcrController.class);
    private static final long MAX_SIZE = 10 * 1024 * 1024;

    private final AiServiceClient aiServiceClient;
    private final SceneValidator validator;
    private final SceneService sceneService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** previewToken 存储（SD-2 契约 15 分钟有效期；Week 6 换 Redis SETEX） */
    private final Map<String, TokenEntry> previewTokens = new ConcurrentHashMap<>();

    private record TokenEntry(long expireAt, List<PhysicsElement> elements) {
    }

    public OcrController(AiServiceClient aiServiceClient, SceneValidator validator,
                         SceneService sceneService) {
        this.aiServiceClient = aiServiceClient;
        this.validator = validator;
        this.sceneService = sceneService;
    }

    @PostMapping("/api/ocr/upload")
    public ResponseEntity<ApiResponse<Map<String, Object>>> upload(
            @RequestParam("file") MultipartFile file) {
        // ① 本地校验：白名单 + 大小（SRS 4.2 文件上传）
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!name.endsWith(".jpg") && !name.endsWith(".jpeg") && !name.endsWith(".png")) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "仅支持 jpg/png 图片");
        }
        if (file.getSize() > MAX_SIZE) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "图片不能超过 10MB");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "读取图片失败");
        }

        // ② Python OCR
        Map<String, Object> ocrResult;
        try {
            ocrResult = aiServiceClient.recognize(Map.of(
                    "imageBase64", Base64.getEncoder().encodeToString(bytes)));
        } catch (FeignException e) {
            if (e.status() == 422) {
                // 低置信度降级（SRS F4.2：建议重拍或手动建场景）
                throw new BusinessException(ErrorCode.DEGRADED, "图片识别不清，建议重拍或手动搭建场景");
            }
            log.warn("OCR 服务异常: {}", e.getMessage());
            throw new BusinessException(ErrorCode.EXTERNAL_UNAVAILABLE, "识别服务暂不可用，请稍后再试");
        }
        String rawText = String.valueOf(ocrResult.getOrDefault("rawText", ""));

        // ③ Python 两步解析
        Map<String, Object> parsed;
        try {
            parsed = aiServiceClient.parseQuestion(Map.of("ocrText", rawText, "uploadId", UUID.randomUUID().toString()));
        } catch (FeignException e) {
            log.warn("题目解析异常: {}", e.getMessage());
            throw new BusinessException(ErrorCode.EXTERNAL_UNAVAILABLE, "解析服务暂不可用，请稍后再试");
        }

        double confidence = toDouble(parsed.get("confidence"), 0);
        String fallbackHint = parsed.get("fallbackHint") == null ? null : String.valueOf(parsed.get("fallbackHint"));
        if (confidence < 0.6 || fallbackHint != null) {
            // 降级：带提示返回（一图多题/题型不匹配等同走此通道，前端给出引导）
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("degraded", true);
            data.put("fallbackHint", fallbackHint != null ? fallbackHint : "题目不够明确，建议手动调整");
            return ResponseEntity.ok(new ApiResponse<>(ErrorCode.DEGRADED.code,
                    "解析置信度不足", data));
        }

        // ④ Java validate 二次校验（SRS F4.2：Python 结果不可信，白名单兜底）
        List<PhysicsElement> elements = objectMapper.convertValue(
                parsed.getOrDefault("recommendedElements", List.of()),
                new TypeReference<List<PhysicsElement>>() {
                });
        Scene scene = new Scene();
        scene.setElements(elements != null ? elements : new ArrayList<>());
        scene.setConfig(defaultConfig(String.valueOf(parsed.getOrDefault("simType", "collision"))));
        var errors = validator.validate(scene);
        if (!errors.isValid()) {
            throw new BusinessException(ErrorCode.DEGRADED,
                    "AI 推荐的元件未通过物理校验，请手动调整",
                    Map.of("errors", errors.getErrors()));
        }

        // ⑤ previewToken（15 分钟）
        String token = UUID.randomUUID().toString().replace("-", "");
        previewTokens.put(token, new TokenEntry(System.currentTimeMillis() + 15 * 60_000L, scene.getElements()));
        previewTokens.entrySet().removeIf(e -> e.getValue().expireAt() < System.currentTimeMillis());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("simType", parsed.get("simType"));
        data.put("recommendedElements", scene.getElements());
        data.put("confidence", confidence);
        data.put("previewToken", token);
        data.put("rawText", rawText);
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** 学生确认预览 → 正式建场景（source=ocr，SD-2 步骤 E） */
    @PostMapping("/api/scenarios/from-preview")
    public ApiResponse<Map<String, Object>> fromPreview(@RequestBody Map<String, Object> body) {
        String token = String.valueOf(body.getOrDefault("previewToken", ""));
        TokenEntry entry = previewTokens.get(token);
        if (entry == null || entry.expireAt() < System.currentTimeMillis()) {
            previewTokens.remove(token);
            throw new BusinessException(ErrorCode.NOT_FOUND, "预览已过期（15 分钟），请重新上传");
        }
        List<PhysicsElement> elements = entry.elements();
        @SuppressWarnings("unchecked")
        List<PhysicsElement> adjusted = body.get("elements") == null ? elements
                : objectMapper.convertValue(body.get("elements"),
                        new TypeReference<List<PhysicsElement>>() {
                        });
        previewTokens.remove(token);
        return ApiResponse.ok(sceneService.create(UserContext.userId(),
                adjusted != null ? adjusted : elements, defaultConfig("collision"), null, "ocr"));
    }

    private static SimulationConfig defaultConfig(String simType) {
        SimulationConfig config = new SimulationConfig();
        if ("projectile".equals(simType)) {
            config.setGravity(new com.physicene.backend.physics.model.Vector2D(0, -9.8));
            config.setMaxDuration(30.0);
        } else {
            config.setGravity(com.physicene.backend.physics.model.Vector2D.ZERO);
            config.setMaxDuration(10.0);
        }
        return config;
    }

    private static double toDouble(Object v, double dflt) {
        return v instanceof Number n ? n.doubleValue() : dflt;
    }
}
