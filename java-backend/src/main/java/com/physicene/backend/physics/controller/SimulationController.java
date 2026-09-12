package com.physicene.backend.physics.controller;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.physics.engine.PhysicsWorld;
import com.physicene.backend.physics.engine.SceneValidator;
import com.physicene.backend.physics.engine.SimResultBuilder;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimResult;
import com.physicene.backend.physics.model.SimulationRunRequest;
import com.physicene.backend.physics.model.ValidationResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 仿真控制接口（SRS 6.1）。
 * Week 2：run 携带内联场景；Week 3 场景入库后支持 sceneId 引用并创建 ExperimentRecord。
 * /{simId}/result 为调试端点，Week 3 由 GET /api/records/{id}（分页回放）替代。
 */
@RestController
@RequestMapping("/api/simulations")
public class SimulationController {

    private final PhysicsWorld physicsWorld;
    private final SceneValidator validator;

    public SimulationController(PhysicsWorld physicsWorld, SceneValidator validator) {
        this.physicsWorld = physicsWorld;
        this.validator = validator;
    }

    @PostMapping("/run")
    public ResponseEntity<ApiResponse<Map<String, Object>>> run(
            @RequestBody SimulationRunRequest request) {
        Scene scene = new Scene();
        scene.setElements(request.getElements());
        scene.setConfig(request.getConfig() != null ? request.getConfig()
                : new com.physicene.backend.physics.model.SimulationConfig());

        ValidationResult result = validator.validate(scene);
        if (!result.isValid()) {
            return ResponseEntity.badRequest().body(
                    new ApiResponse<>(1001, "场景校验未通过", Map.of("errors", result.getErrors())));
        }

        String simId = physicsWorld.start(scene);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("simId", simId);
        data.put("wsUrl", "/ws/simulation/" + simId);
        data.put("recordId", null); // Week 3 持久化后返回记录 id
        data.put("estimatedFrames", estimatedFrames(scene));
        return ResponseEntity.ok(ApiResponse.ok(data));
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
