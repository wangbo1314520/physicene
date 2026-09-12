package com.physicene.backend.physics.template;

import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 模板注册表：Spring 收集全部模板 bean；加新模板只加实现类。 */
@Component
public class TemplateRegistry {

    private final Map<String, SimulationTemplate> templates = new HashMap<>();

    public TemplateRegistry(List<SimulationTemplate> beans) {
        for (SimulationTemplate template : beans) {
            templates.put(template.getType(), template);
        }
    }

    public List<Map<String, Object>> listSummaries() {
        return templates.values().stream()
                .map(t -> Map.<String, Object>of(
                        "id", t.getType(),
                        "name", t.getDisplayName(),
                        "description", t.getDescription()))
                .toList();
    }

    public SimulationTemplate get(String type) {
        SimulationTemplate template = templates.get(type);
        if (template == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "模板不存在: " + type);
        }
        return template;
    }
}
