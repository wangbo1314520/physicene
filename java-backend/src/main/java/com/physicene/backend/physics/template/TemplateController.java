package com.physicene.backend.physics.template;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.util.UserContext;
import com.physicene.backend.scene.SceneService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** 模板接口（SRS 6.1：列表 / 详情 / 加载派生新场景）。 */
@RestController
@RequestMapping("/api/templates")
public class TemplateController {

    private final TemplateRegistry registry;
    private final SceneService sceneService;

    public TemplateController(TemplateRegistry registry, SceneService sceneService) {
        this.registry = registry;
        this.sceneService = sceneService;
    }

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        return ApiResponse.ok(registry.listSummaries());
    }

    @GetMapping("/{id}")
    public ApiResponse<Map<String, Object>> detail(@PathVariable String id) {
        SimulationTemplate template = registry.get(id);
        return ApiResponse.ok(Map.of(
                "id", template.getType(),
                "name", template.getDisplayName(),
                "description", template.getDescription(),
                "initialScene", Map.of(
                        "elements", template.initialScene().getElements(),
                        "config", template.initialScene().getConfig())));
    }

    /** 深拷贝生成新场景并持久化（source=template，SRS F2.5 模板隔离） */
    @PostMapping("/{id}/load")
    public ApiResponse<Map<String, Object>> load(@PathVariable String id) {
        SimulationTemplate template = registry.get(id);
        return ApiResponse.ok(sceneService.createFromTemplate(
                UserContext.userId(), template.getType(), template.initialScene()));
    }
}
