package com.physicene.backend.physics.controller;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.UserContext;
import com.physicene.backend.physics.engine.PhysicsWorld;
import com.physicene.backend.physics.engine.SceneValidator;
import com.physicene.backend.physics.engine.SimResultBuilder;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimResult;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.SimulationRunRequest;
import com.physicene.backend.physics.model.ValidationResult;
import com.physicene.backend.physics.record.ExperimentRecordEntity;
import com.physicene.backend.physics.record.RecordRepository;
import com.physicene.backend.scene.SceneService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 仿真控制接口（SRS 6.1）。
 * 第三周：sceneId 运行接入持久化（ExperimentRecord 入库 → ended 回调完成）；
 * 内联场景保留为调试通道（SimView 演示页使用，不产生记录）。
 */
@RestController
@RequestMapping("/api/simulations")
public class SimulationController {

    private static final Logger log = LoggerFactory.getLogger(SimulationController.class);

    private final PhysicsWorld physicsWorld;
    private final SceneValidator validator;
    private final SceneService sceneService;
    private final RecordRepository recordRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SimulationController(PhysicsWorld physicsWorld, SceneValidator validator,
                                SceneService sceneService, RecordRepository recordRepository) {
        this.physicsWorld = physicsWorld;
        this.validator = validator;
        this.sceneService = sceneService;
        this.recordRepository = recordRepository;
    }

    @PostMapping("/run")
    public ResponseEntity<ApiResponse<Map<String, Object>>> run(
            @RequestBody SimulationRunRequest request) {
        Long userId = UserContext.userId();
        Long scenarioId = null;
        Scene scene;

        if (request.getSceneId() != null && !request.getSceneId().isBlank()) {
            scenarioId = Long.valueOf(request.getSceneId());
            scene = sceneService.loadSceneForRun(userId, scenarioId); // 归属校验 403/404
            // 2.3 双轨契约（2026-10-11）：DB 存 Geo 草稿（含 links，物理类型不在 L1 白名单），
            // 请求带映射后 elements 时优先用之——sceneId 只担 record 归属/回放，物理形态以请求为准
            if (request.getElements() != null && !request.getElements().isEmpty()) {
                scene.setElements(request.getElements());
                if (request.getConfig() != null) {
                    scene.setConfig(request.getConfig());
                }
            }
        } else {
            scene = new Scene();
            scene.setElements(request.getElements());
            scene.setConfig(request.getConfig() != null ? request.getConfig() : new SimulationConfig());
        }

        ValidationResult result = validator.validate(scene); // run 前重新 validate（契约）
        if (!result.isValid()) {
            return ResponseEntity.badRequest().body(
                    new ApiResponse<>(ErrorCode.PARAM_INVALID.code, "场景校验未通过",
                            Map.of("errors", result.getErrors())));
        }

        String simId = physicsWorld.start(scene, userId);
        Long recordId = null;

        if (scenarioId != null) {
            ExperimentRecordEntity record = new ExperimentRecordEntity();
            record.setStudentId(userId);
            record.setScenarioId(scenarioId);
            record.setSimId(simId);
            record.setStartTime(LocalDateTime.now());
            record.setStatus(ExperimentRecordEntity.Status.RUNNING);
            recordRepository.save(record);
            recordId = record.getId();

            attachRecordCompletion(simId, record.getId());
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("simId", simId);
        data.put("wsUrl", "/ws/simulation/" + simId);
        data.put("recordId", recordId);
        data.put("estimatedFrames", estimatedFrames(scene));
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** ended 回调：完成记录并持久化 SimResult（含 dataTable/charts/keyEvents，供 REST 回放） */
    private void attachRecordCompletion(String simId, Long recordId) {
        SimulationInstance instance = physicsWorld.getInstance(simId);
        if (instance == null) {
            return;
        }
        Runnable persist = () -> {
            try {
                ExperimentRecordEntity record = recordRepository.findById(recordId).orElse(null);
                if (record == null) {
                    return;
                }
                if (record.getStatus() != ExperimentRecordEntity.Status.RUNNING) {
                    return; // 已持久化过（双重触发兜底）
                }
                record.setEndTime(LocalDateTime.now());
                record.setStatus("error".equals(instance.getEndInfo() != null
                        ? instance.getEndInfo().reason() : "")
                        ? ExperimentRecordEntity.Status.FAILED
                        : ExperimentRecordEntity.Status.COMPLETED);
                SimResult simResult = SimResultBuilder.build(instance);
                record.setSimResult(objectMapper.writeValueAsString(simResult));
                record.setUpdatedAt(LocalDateTime.now());
                recordRepository.save(record);
            } catch (Exception e) {
                log.error("记录持久化失败 recordId={}", recordId, e);
            }
        };
        instance.addEndListener(end -> persist.run());
        // 竞态兜底：极短仿真可能在挂监听前就已结束（start 先于 save/attach 执行）
        if (instance.isEnded()) {
            persist.run();
        }
    }

    @GetMapping("/{simId}/result")
    public ResponseEntity<ApiResponse<SimResult>> result(@PathVariable String simId) {
        SimulationInstance instance = physicsWorld.getInstance(simId);
        if (instance == null) {
            return ResponseEntity.status(404).body(new ApiResponse<>(1004, "仿真不存在", null));
        }
        return ResponseEntity.ok(ApiResponse.ok(SimResultBuilder.build(instance)));
    }

    @GetMapping("/{simId}/state")
    public ResponseEntity<ApiResponse<Map<String, Object>>> state(@PathVariable String simId) {
        SimulationInstance instance = physicsWorld.getInstance(simId);
        if (instance == null) {
            return ResponseEntity.status(404).body(new ApiResponse<>(1004, "仿真不存在", null));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("simId", simId);
        data.put("status", instance.isEnded() ? "ended"
                : instance.isPaused() ? "paused" : "running");
        data.put("currentT", instance.getCurrentT());
        data.put("frameCount", instance.getFrameCount());
        data.put("keyEvents", instance.getKeyEvents());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    private static int estimatedFrames(Scene scene) {
        var cfg = scene.getConfig();
        return (int) Math.min(cfg.getMaxFrames(), Math.round(cfg.getMaxDuration() / cfg.getTimestep()));
    }
}
