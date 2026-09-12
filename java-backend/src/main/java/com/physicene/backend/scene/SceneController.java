package com.physicene.backend.scene;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.util.UserContext;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 场景管理接口（SRS 6.1 / 33 契约之"场景 5 接口"）。 */
@RestController
@RequestMapping("/api/scenarios")
public class SceneController {

    private final SceneService sceneService;

    public SceneController(SceneService sceneService) {
        this.sceneService = sceneService;
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> create(@RequestBody SceneService.SceneCreateRequest req) {
        return ApiResponse.ok(sceneService.create(UserContext.userId(), req.elements(), req.config(),
                null, req.source()));
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(sceneService.list(UserContext.userId(), page, size));
    }

    @GetMapping("/{id}")
    public ApiResponse<Map<String, Object>> get(@PathVariable Long id) {
        return ApiResponse.ok(sceneService.get(UserContext.userId(), id));
    }

    /** 全量替换 elements（重建物理世界，SRS 契约） */
    @PutMapping("/{id}")
    public ApiResponse<Map<String, Object>> update(@PathVariable Long id,
                                                   @RequestBody SceneService.SceneUpdateRequest req) {
        return ApiResponse.ok(sceneService.update(UserContext.userId(), id, req.elements(), req.config()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        sceneService.delete(UserContext.userId(), id);
        return ApiResponse.ok();
    }
}
