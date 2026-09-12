package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.model.ValidationError;
import com.physicene.backend.physics.model.ValidationResult;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 场景校验（SRS F2.0 三层约束）：
 * L1 类型白名单（ElementRegistry）；L2 物理合理范围；L3 跨元件一致性（警告放行）。
 * Week 2 实现静态规则；L3 关系识别（如"方块在斜面上"）随模板周增强。
 */
@Component
public class SceneValidator {

    private static final double MAX_MASS = 1e6;

    private final ElementRegistry registry;

    public SceneValidator(ElementRegistry registry) {
        this.registry = registry;
    }

    public ValidationResult validate(com.physicene.backend.physics.model.Scene scene) {
        List<ValidationError> errors = new ArrayList<>();
        var config = scene.getConfig();

        if (scene.getElements().isEmpty()) {
            errors.add(error("", ">=1", "0", "场景至少需要 1 个元件", "error"));
        }
        if (config.getTimestep() <= 0 || config.getTimestep() > 0.1) {
            errors.add(error("config.timestep", "(0, 0.1]", String.valueOf(config.getTimestep()),
                    "物理步长超出合理范围", "error"));
        }
        if (config.getMaxDuration() <= 0 || config.getMaxDuration() > 300) {
            errors.add(error("config.maxDuration", "(0, 300]", String.valueOf(config.getMaxDuration()),
                    "最大时长超出合理范围", "error"));
        }

        for (int i = 0; i < scene.getElements().size(); i++) {
            var e = scene.getElements().get(i);
            String base = "elements[" + i + "]";
            String id = e.getId() == null ? "#" + i : e.getId();

            if (e.getId() == null || e.getId().isBlank()) {
                errors.add(error(base + ".id", "非空", "null", "元件缺少 id", "error"));
            }
            if (e.getType() == null || !registry.supports(e.getType())) {
                errors.add(error(base + ".type", String.valueOf(registry.supportedTypes()),
                        String.valueOf(e.getType()), "元件类型不在白名单内（L1）", "error"));
            }
            if (e.getPosition() == null) {
                errors.add(error(base + ".position", "非空", "null", "元件缺少位置", "error"));
            }
            if (e.getScale() != null && (e.getScale().x() <= 0 || e.getScale().y() <= 0)) {
                errors.add(error(base + ".scale", ">0", e.getScale().toString(), "缩放必须为正", "error"));
            }
            if (e.getProperties() != null) {
                double m = e.getProperties().getMass();
                if (m <= 0 || m >= MAX_MASS) {
                    errors.add(error(base + ".properties.mass", "(0, 1e6)", String.valueOf(m),
                            "质量超出物理合理范围（L2）", id + " 的质量非法"));
                }
                double f = e.getProperties().getFriction();
                if (f < 0 || f > 1) {
                    errors.add(error(base + ".properties.friction", "[0, 1]", String.valueOf(f),
                            "摩擦系数超出范围（L2）", "error"));
                }
                double r = e.getProperties().getRestitution();
                if (r < 0 || r > 1) {
                    errors.add(error(base + ".properties.restitution", "[0, 1]", String.valueOf(r),
                            "恢复系数超出范围（L2）", "error"));
                }
            }
        }

        // L3 警告示例：空气阻力关闭时 dragCoeff 不生效（SRS F2.3）
        if (!config.isAirResistance() && config.getDragCoeff() != 0.1) {
            errors.add(error("config.dragCoeff", "默认 0.1", String.valueOf(config.getDragCoeff()),
                    "空气阻力未开启，阻力系数不生效（L3 警告）", "warning"));
        }

        return new ValidationResult(errors.stream().noneMatch(e -> "error".equals(e.getLevel())), errors);
    }

    private static ValidationError error(String field, String expected, String actual,
                                         String message, String level) {
        return new ValidationError(field, expected, actual, message, level);
    }
}
