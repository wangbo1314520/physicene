package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.model.PhysicsElement;
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

        // ===== 统一搭建台阶段一：新类型 L2/L3 校验（方案 §3.7）=====
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (var e : scene.getElements()) {
            ids.add(e.getId());
        }
        java.util.Set<String> jointTypes = java.util.Set.of("rope", "rod", "spring", "pulley");
        for (int i = 0; i < scene.getElements().size(); i++) {
            var e = scene.getElements().get(i);
            String base = "elements[" + i + "]";
            java.util.Map<String, Double> pr = e.getParams() == null ? java.util.Map.of() : e.getParams();
            switch (e.getType()) {
                case "belt" -> {
                    if (!e.isFixed()) {
                        errors.add(error(base + ".isFixed", "true", "false", "传送带必须固定（belt 为静态表面）", "error"));
                    }
                    double vb = pr.getOrDefault("beltSpeed", 0.0);
                    if (Math.abs(vb) > 8) {
                        errors.add(error(base + ".params.beltSpeed", "[-8,8]", String.valueOf(vb), "带速超出范围", "error"));
                    }
                    if (e.getProperties().getFriction() == 0) {
                        errors.add(error(base + ".properties.friction", ">0", "0", "带摩擦为零时无法拖动物块（L3 警告）", "warning"));
                    }
                }
                case "loop_track" -> {
                    if (!e.isFixed()) {
                        errors.add(error(base + ".isFixed", "true", "false", "圆轨道必须固定", "error"));
                    }
                    double r = pr.getOrDefault("radius", e.getScale().x());
                    if (r < 0.1 || r > 5) {
                        errors.add(error(base + ".params.radius", "[0.1,5]", String.valueOf(r), "轨道半径超出范围", "error"));
                    }
                    double a0 = pr.getOrDefault("arcA0", 0.0), a1 = pr.getOrDefault("arcA1", 360.0);
                    if (a1 - a0 < 30 || a1 - a0 > 360.0001) {
                        errors.add(error(base + ".params.arcSpan", "[30,360]", (a1 - a0) + "", "弧跨超出范围", "error"));
                    }
                    double side = pr.getOrDefault("arcSideCode", 0.0);
                    if (side < 0 || side > 2 || side != Math.floor(side)) {
                        errors.add(error(base + ".params.arcSideCode", "{0,1,2}", String.valueOf(side), "side 0=inner/1=outer/2=both", "error"));
                    }
                }
                case "rope", "rod" -> requireTarget(errors, base, e, ids, jointTypes, pr, "jointLength");
                case "spring" -> requireTarget(errors, base, e, ids, jointTypes, pr, "stiffness");
                case "pulley" -> {
                    if (e.getConnectTo() == null || e.getConnectTo2() == null) {
                        errors.add(error(base + ".connectTo/connectTo2", "非空", "null", "滑轮需要两个连接本体", "error"));
                    } else if (!ids.contains(e.getConnectTo()) || !ids.contains(e.getConnectTo2())) {
                        errors.add(error(base + ".connectTo", "存在的元件 id", e.getConnectTo() + "/" + e.getConnectTo2(), "连接目标不存在", "error"));
                    }
                    double ratio = pr.getOrDefault("ratio", 1.0);
                    if (ratio != 1 && ratio != 2) {
                        errors.add(error(base + ".params.ratio", "{1,2}", String.valueOf(ratio), "ratio 只支持 1（定滑轮）或 2（动滑轮）", "error"));
                    }
                }
                default -> {
                }
            }
            if (pr.getOrDefault("bullet", 0.0) != 0 && pr.getOrDefault("bullet", 0.0) != 1) {
                errors.add(error(base + ".params.bullet", "{0,1}", String.valueOf(pr.get("bullet")), "bullet 只允许 0/1", "error"));
            }
        }
        int substeps = scene.getConfig().getSubsteps();
        if (substeps < 1 || substeps > 8) {
            errors.add(error("config.substeps", "[1,8]", String.valueOf(substeps), "子步数超出范围", "error"));
        }
        boolean hasLoopOrPulley = scene.getElements().stream().anyMatch(e -> "loop_track".equals(e.getType()) || "pulley".equals(e.getType()));
        if (hasLoopOrPulley && substeps < 4) {
            errors.add(error("config.substeps", ">=4（含 loop_track/pulley 时）", String.valueOf(substeps),
                    "圆轨道导轨/滑轮罚力要求 substeps≥4 保数值稳定（L3）", "warning"));
        }

        // L3 警告示例：空气阻力关闭时 dragCoeff 不生效（SRS F2.3）
        if (!config.isAirResistance() && config.getDragCoeff() != 0.1) {
            errors.add(error("config.dragCoeff", "默认 0.1", String.valueOf(config.getDragCoeff()),
                    "空气阻力未开启，阻力系数不生效（L3 警告）", "warning"));
        }

        return new ValidationResult(errors.stream().noneMatch(e -> "error".equals(e.getLevel())), errors);
    }

    /** 关节类元件公共校验：连接目标存在且非关节、参数为正 */
    private static void requireTarget(List<ValidationError> errors, String base, PhysicsElement e,
                                      java.util.Set<String> ids, java.util.Set<String> jointTypes,
                                      java.util.Map<String, Double> pr, String posParam) {
        String tgt = e.getConnectTo();
        if (tgt == null || !ids.contains(tgt)) {
            errors.add(error(base + ".connectTo", "存在的元件 id", String.valueOf(tgt), "连接目标不存在", "error"));
        }
        if (e.getConnectTo2() != null && !ids.contains(e.getConnectTo2())) {
            errors.add(error(base + ".connectTo2", "存在的元件 id", e.getConnectTo2(), "第二连接目标不存在", "error"));
        }
        double v = pr.getOrDefault(posParam, 1.0);
        if (v <= 0 || (posParam.equals("stiffness") && v > 5000)) {
            errors.add(error(base + ".params." + posParam, posParam.equals("stiffness") ? "(0,5000]" : ">0",
                    String.valueOf(v), posParam + " 超出范围", "error"));
        }
        if ("spring".equals(e.getType())) {
            double z = pr.getOrDefault("dampingRatio", 0.05);
            if (z < 0 || z > 1) {
                errors.add(error(base + ".params.dampingRatio", "[0,1]", String.valueOf(z), "阻尼比超出范围", "error"));
            }
        }
    }

    private static ValidationError error(String field, String expected, String actual,
                                         String message, String level) {
        return new ValidationError(field, expected, actual, message, level);
    }
}
