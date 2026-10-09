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
                case "rope", "rod" -> requireTarget(errors, base, e, ids, jointTypes, pr, "jointLength", scene.getElements());
                case "spring" -> requireTarget(errors, base, e, ids, jointTypes, pr, "stiffness", scene.getElements());
                case "pulley" -> {
                    // 动滑轮（2026-10-07 决策批准）：绳端允许静态锚——end0x/end1x 世界坐标（RunBridge 生成），
                    // connectTo 可空；两端都无（无本体且无坐标）才是错误
                    boolean movableEnd0 = pr.containsKey("end0x") || (e.getConnectTo() != null && ids.contains(e.getConnectTo()));
                    boolean movableEnd1 = pr.containsKey("end1x") || (e.getConnectTo2() != null && ids.contains(e.getConnectTo2()));
                    boolean isMovable = pr.containsKey("M") || "2.0".equals(String.valueOf(pr.getOrDefault("ratio", 1.0)));
                    if (isMovable && movableEnd0 && movableEnd1) {
                        // 动滑轮路径：跳过定滑轮两端本体校验（L3 绳段校验不适用——端是静态锚或混合）
                    } else if (e.getConnectTo() == null || e.getConnectTo2() == null) {
                        errors.add(error(base + ".connectTo/connectTo2", "非空", "null", "滑轮需要两个连接本体", "error"));
                    } else if (!ids.contains(e.getConnectTo()) || !ids.contains(e.getConnectTo2())) {
                        errors.add(error(base + ".connectTo", "存在的元件 id", e.getConnectTo() + "/" + e.getConnectTo2(), "连接目标不存在", "error"));
                    } else {
                        // L3 绳段退化警告（阶段三·五结案遗留）：l→0（物体撞入滑轮锚点）时约束方向退化、系统冻结
                        // 判据 1：任一绳段初始长 < 0.5m；判据 2：min(l₁,l₂) − ½·a·maxDuration² < 0.5m
                        //（a=|mA−mB|g/(mA+mB) 由两连体质量估计；含固定端时只做判据 1）
                        double p1x = e.getPosition().x() + pr.getOrDefault("pulley1dx", 0.0);
                        double p1y = e.getPosition().y() + pr.getOrDefault("pulley1dy", 0.0);
                        double p2x = e.getPosition().x() + pr.getOrDefault("pulley2dx", 0.0);
                        double p2y = e.getPosition().y() + pr.getOrDefault("pulley2dy", 0.0);
                        PhysicsElement ca = scene.getElements().stream()
                                .filter(x -> e.getConnectTo().equals(x.getId())).findFirst().orElse(null);
                        PhysicsElement cb = scene.getElements().stream()
                                .filter(x -> e.getConnectTo2().equals(x.getId())).findFirst().orElse(null);
                        double l1 = ca == null ? 1 : Math.hypot(ca.getPosition().x() - p1x, ca.getPosition().y() - p1y);
                        double l2 = cb == null ? 1 : Math.hypot(cb.getPosition().x() - p2x, cb.getPosition().y() - p2y);
                        if (l1 < 0.5 || l2 < 0.5) {
                            errors.add(error(base + ".geometry", "绳段初始长≥0.5m",
                                    String.format("l1=%.2f,l2=%.2f", l1, l2),
                                    "绳段过短：物体易到达滑轮锚点导致约束退化冻结（L3）", "warning"));
                        } else if (ca != null && cb != null && ca.getProperties() != null && cb.getProperties() != null) {
                            double mA = ca.getProperties().getMass(), mB = cb.getProperties().getMass();
                            if (mA > 0 && mB > 0 && !ca.isFixed() && !cb.isFixed()) {
                                double acc = Math.abs(mA - mB) * 9.8 / (mA + mB);
                                double travel = 0.5 * acc * scene.getConfig().getMaxDuration()
                                        * scene.getConfig().getMaxDuration();
                                double margin = Math.min(l1, l2) - travel;
                                if (margin < 0.5) {
                                    errors.add(error(base + ".geometry", "min(l)−½aT²≥0.5m",
                                            String.format("余量=%.2fm(行程估计%.1fm)", margin, travel),
                                            "绳段行程余量不足：运行中物体可能撞入滑轮锚点冻结（L3）", "warning"));
                                }
                            }
                        }
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
                                      java.util.Map<String, Double> pr, String posParam,
                                      java.util.List<PhysicsElement> elements) {
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
        // 绳长 vs 端点距离校验（不可伸长绳的初始位形约束——redo 探针 E3 升杆场景暴露的缺失）：
        // 悬点模式（connectTo2 空）：d = |rope.position(悬点) − 连体锚世界|；
        // 双体模式：d = |锚A世界 − 锚B世界|。d > L×1.02 → 初始拉伸违反（求解器瞬拉/震荡），error。
        // d ≤ L 合法（松弛垂挂是绳的正常状态）。弹簧连接式拉压双向，无此约束，不校验。
        if ("rope".equals(e.getType()) && tgt != null && ids.contains(tgt)) {
            PhysicsElement a = elements.stream().filter(x -> tgt.equals(x.getId())).findFirst().orElse(null);
            if (a != null && e.getPosition() != null && a.getPosition() != null) {
                double[] aw = anchorWorld(a);
                double d;
                String tgt2 = e.getConnectTo2();
                PhysicsElement b = tgt2 == null ? null
                        : elements.stream().filter(x -> tgt2.equals(x.getId())).findFirst().orElse(null);
                if (b != null && b.getPosition() != null) {
                    double[] bw = anchorWorld(b);
                    // 双体：两端各自锚点（anchorA 语义在前端桥已折算到 A 端锚；Java 锚A/锚B 均连体局部）
                    double[] awA = anchorWorld(e, e.getAnchorA(), a);
                    double[] bwB = anchorWorld(e, e.getAnchorB(), b);
                    d = Math.hypot(awA[0] - bwB[0], awA[1] - bwB[1]);
                } else {
                    // 悬点：rope.position 即固定端（前端桥约定），连体侧取其锚点
                    double[] awA = anchorWorld(e, e.getAnchorA(), a);
                    d = Math.hypot(awA[0] - e.getPosition().x(), awA[1] - e.getPosition().y());
                }
                if (d > v * 1.02) {
                    errors.add(error(base + ".geometry", "端点距离 ≤ 绳长 L×1.02",
                            String.format("d=%.2f > L=%.2f", d, v),
                            "绳初始位形违反不可伸长约束（端点距离超过绳长），求解器将瞬拉——请缩短绳长或移动端点", "error"));
                }
            }
        }
    }

    /** 元件中心世界坐标（SceneValidator 层无 body，直接用 element position） */
    private static double[] anchorWorld(PhysicsElement el) {
        return new double[]{ el.getPosition().x(), el.getPosition().y() };
    }

    /** 连体上的锚点世界坐标：el.position + R(el.angle)·anchor（anchor 为连体局部坐标） */
    private static double[] anchorWorld(PhysicsElement joint, com.physicene.backend.physics.model.Vector2D anchor, PhysicsElement el) {
        double ang = el.getAngle();
        double c = Math.cos(ang), s = Math.sin(ang);
        double ax = anchor == null ? 0 : anchor.x(), ay = anchor == null ? 0 : anchor.y();
        return new double[]{ el.getPosition().x() + c * ax - s * ay, el.getPosition().y() + s * ax + c * ay };
    }

    private static ValidationError error(String field, String expected, String actual,
                                         String message, String level) {
        return new ValidationError(field, expected, actual, message, level);
    }
}
