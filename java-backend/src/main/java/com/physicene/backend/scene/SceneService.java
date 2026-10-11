package com.physicene.backend.scene;

import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.scene.model.ExperimentScenarioEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 场景服务（SRS F2.5 / SD-1）：CRUD + 归属校验 + 模板派生（深拷贝）。
 * scene_data 以 JSON 字符串存 JSON 列；type 由场景内容推导（模板派生时显式指定）。
 * 2026-10-11 双轨契约：保存/读取走原始 Geo 形状（links 等不丢）；物理校验移至 run 时
 * （loadSceneForRun 读 typed 投影，run 请求可带映射后 elements 覆盖——见 SimulationController）。
 */
@Service
public class SceneService {

    private final SceneRepository repository;
    private final com.physicene.backend.physics.record.RecordRepository recordRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SceneService(SceneRepository repository,
                        com.physicene.backend.physics.record.RecordRepository recordRepository) {
        this.repository = repository;
        this.recordRepository = recordRepository;
    }

    /** 请求 DTO：elements 保持原始 Geo 形状（List<Map>）——links/锚点等搭建信息不在
     *  PhysicsElement 类型里，typed 反序列化会静默丢字段（2026-10-11 深链丢连线根因） */
    public record SceneCreateRequest(List<Map<String, Object>> elements, SimulationConfig config, String source) {
    }

    public record SceneUpdateRequest(List<Map<String, Object>> elements, SimulationConfig config) {
    }

    public Map<String, Object> create(Long userId, List<Map<String, Object>> elements,
                                      SimulationConfig config, String type, String source) {
        validateDraft(elements);
        ExperimentScenarioEntity entity = new ExperimentScenarioEntity();
        entity.setType(type != null ? type : "free_build");
        entity.setSceneData(writeJsonRaw(elements, config));
        entity.setSource(source == null ? ExperimentScenarioEntity.Source.MANUAL
                : ExperimentScenarioEntity.Source.valueOf(source.toUpperCase()));
        entity.setCreatorId(userId);
        repository.save(entity);
        return summary(entity, true);
    }

    /** 详情（含完整 Scene），做归属校验 */
    public Map<String, Object> get(Long userId, Long id) {
        ExperimentScenarioEntity entity = loadOwned(userId, id);
        return summary(entity, true);
    }

    public Map<String, Object> update(Long userId, Long id, List<Map<String, Object>> elements,
                                      SimulationConfig config) {
        ExperimentScenarioEntity entity = loadOwned(userId, id);
        validateDraft(elements);
        entity.setSceneData(writeJsonRaw(elements, config));
        entity.setUpdatedAt(java.time.LocalDateTime.now());
        repository.save(entity);
        return summary(entity, true);
    }

    /** 删除：连带清理实验记录（FK 约束）；契约幂等语义——第二次删除 404 */
    @org.springframework.transaction.annotation.Transactional
    public void delete(Long userId, Long id) {
        ExperimentScenarioEntity entity = loadOwned(userId, id);
        recordRepository.deleteByScenarioId(entity.getId());
        repository.delete(entity);
    }

    /** 分页列表（摘要：不含 elements，避免 N+1 <100ms，SRS 6.1） */
    public Map<String, Object> list(Long userId, int page, int size) {
        Page<ExperimentScenarioEntity> result = repository.findByCreatorId(userId,
                PageRequest.of(Math.max(0, page - 1), Math.min(100, Math.max(1, size)),
                        Sort.by(Sort.Direction.DESC, "updatedAt")));
        return Map.of(
                "total", result.getTotalElements(),
                "page", page,
                "size", size,
                "items", result.getContent().stream().map(e -> summary(e, false)).toList());
    }

    /** 供 run 接口加载完整场景（归属校验） */
    public Scene loadSceneForRun(Long userId, Long id) {
        ExperimentScenarioEntity entity = loadOwned(userId, id);
        return readScene(entity);
    }

    /** 模板加载：深拷贝生成新场景（source=template，模板本身只读，SRS F2.5 模板隔离） */
    public Map<String, Object> createFromTemplate(Long userId, String templateType, Scene templateScene) {
        List<Map<String, Object>> raw = objectMapper.convertValue(templateScene.getElements(),
                new tools.jackson.core.type.TypeReference<List<Map<String, Object>>>() {
                });
        return create(userId, raw, templateScene.getConfig(), templateType, "template");
    }

    // ===== 内部 =====

    /** 草稿级结构校验（原 L1 物理白名单校验移至 run 时——保存的是 Geo 搭建形状，
     *  block/ground 等类型合法；运行走 RunBridge 映射后的物理形态，SimulationController
     *  在 run 前仍会 validate） */
    private void validateDraft(List<Map<String, Object>> elements) {
        if (elements == null) {
            return;
        }
        if (elements.size() > 500) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "元件数超上限（500）");
        }
        for (Map<String, Object> e : elements) {
            Object id = e.get("id"), type = e.get("type");
            if (!(id instanceof String s1) || s1.isBlank() || !(type instanceof String s2) || s2.isBlank()) {
                throw new BusinessException(ErrorCode.PARAM_INVALID, "元件缺少 id/type");
            }
        }
    }

    private ExperimentScenarioEntity loadOwned(Long userId, Long id) {
        ExperimentScenarioEntity entity = repository.findById(id).orElse(null);
        if (entity == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "场景不存在: " + id);
        }
        if (!entity.getCreatorId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权访问他人场景");
        }
        return entity;
    }

    private Map<String, Object> summary(ExperimentScenarioEntity entity, boolean withElements) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", entity.getId());
        map.put("type", entity.getType());
        map.put("source", entity.getSource().name().toLowerCase());
        map.put("createdAt", entity.getCreatedAt().toString());
        map.put("updatedAt", entity.getUpdatedAt().toString());
        List<Map<String, Object>> raw = rawElements(entity);
        map.put("elementCount", raw.size());
        Scene scene = readScene(entity);
        map.put("config", scene.getConfig());
        if (withElements) {
            map.put("elements", raw);   // 原始 Geo 形状（含 links）——前端加载可继续编辑
        }
        return map;
    }

    /** sceneData 里的原始 elements（Geo 形状，未过 PhysicsElement 类型过滤） */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> rawElements(ExperimentScenarioEntity entity) {
        Map<String, Object> raw = objectMapper.readValue(entity.getSceneData(),
                new tools.jackson.core.type.TypeReference<Map<String, Object>>() {
                });
        Object els = raw.get("elements");
        return els instanceof List ? (List<Map<String, Object>>) els : new java.util.ArrayList<>();
    }

    private Scene toScene(String sceneId, List<PhysicsElement> elements, SimulationConfig config) {
        Scene scene = new Scene();
        scene.setSceneId(sceneId);
        scene.setElements(elements != null ? elements : new java.util.ArrayList<>());
        scene.setConfig(config != null ? config : new SimulationConfig());
        return scene;
    }

    /** 存原始 Geo JSON（links 等搭建字段原样保留） */
    private String writeJsonRaw(List<Map<String, Object>> elements, SimulationConfig config) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("elements", elements != null ? elements : new java.util.ArrayList<>());
        data.put("config", config != null ? config : new SimulationConfig());
        return objectMapper.writeValueAsString(data);
    }

    private Scene readScene(ExperimentScenarioEntity entity) {
        Map<String, Object> raw = objectMapper.readValue(entity.getSceneData(),
                new tools.jackson.core.type.TypeReference<Map<String, Object>>() {
                });
        List<PhysicsElement> elements = objectMapper.convertValue(raw.get("elements"),
                new tools.jackson.core.type.TypeReference<List<PhysicsElement>>() {
                });
        SimulationConfig config = objectMapper.convertValue(raw.get("config"), SimulationConfig.class);
        Scene scene = toScene(String.valueOf(entity.getId()), elements, config);
        return scene;
    }
}
