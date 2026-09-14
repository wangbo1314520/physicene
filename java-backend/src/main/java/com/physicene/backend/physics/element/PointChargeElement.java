package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/**
 * 点电荷元件（V1.5 电磁提前实装，选择性必修二/三 场实验）：
 * 受力 F = qE + qv×B，E/B 来自场景中的 e_field / b_field 区域元件（教学量纲）。
 */
public class PointChargeElement extends AbstractMechanicalElement {

    /** 库仑力常数（教学量纲：q 用库仑量级、距离米、演示尺度可视化校准） */
    public static final double K = 20.0;

    public PointChargeElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "point_charge";
    }

    @Override
    protected Convex buildShape() {
        double r = 0.25 * Math.max(0.05, (data.getScale().x() + data.getScale().y()) / 2);
        return Geometry.createCircle(r);
    }

    @Override
    protected double momentOfInertia(double mass) {
        double r = 0.25 * Math.max(0.05, (data.getScale().x() + data.getScale().y()) / 2);
        return 0.5 * mass * r * r;
    }

    @Override
    public boolean hasCustomForce() {
        return true;
    }

    @Override
    public Vector2D computeForce(ElementContext ctx) {
        double q = data.getProperties().getCharge();
        if (q == 0) {
            return null;
        }
        Vector2D v = ctx.getVelocityMap().getOrDefault(data.getId(), Vector2D.ZERO);
        double fx = 0;
        double fy = 0;

        for (PhysicsElement el : ctx.getAllElements()) {
            var p = el.getProperties();
            switch (el.getType()) {
                case "e_field" -> {
                    if (isInside(el, ctx.getPositionMap().get(data.getId()))) {
                        // F = qE（区域内的匀强电场）
                        if (p.getEFieldX() != null) {
                            fx += q * p.getEFieldX();
                        }
                        if (p.getEFieldY() != null) {
                            fy += q * p.getEFieldY();
                        }
                    }
                }
                case "b_field", "magnet" -> {
                    // 洛伦兹力 F = qv×B，B 垂直纸面：out → F = qB(vy, −vx)；in → 反向
                    if (p.getBField() != null && p.getBField() != 0
                            && isInside(el, ctx.getPositionMap().get(data.getId()))) {
                        double b = p.getBField() * ("in".equals(p.getBDirection()) ? -1 : 1);
                        fx += q * b * v.y();
                        fy += -q * b * v.x();
                    }
                }
                case "point_charge" -> {
                    // 库仑力 F = K·q1·q2/r²（同号斥、异号吸；近距钳制防数值爆炸）
                    if (!el.getId().equals(data.getId()) && p.getCharge() != 0) {
                        Vector2D p1 = ctx.getPositionMap().get(data.getId());
                        Vector2D p2 = ctx.getPositionMap().get(el.getId());
                        if (p1 != null && p2 != null) {
                            double dx = p1.x() - p2.x();
                            double dy = p1.y() - p2.y();
                            double r = Math.max(0.6, Math.hypot(dx, dy));
                            double f = K * q * p.getCharge() / (r * r);
                            fx += f * dx / r;
                            fy += f * dy / r;
                        }
                    }
                }
                default -> {
                }
            }
        }
        return new Vector2D(fx, fy);
    }

    /** 电荷中心是否落在区域元件内（区域按 scale 尺寸的矩形判定） */
    private static boolean isInside(PhysicsElement field, Vector2D pos) {
        if (pos == null || isScaleZero(field)) {
            return false;
        }
        double halfW = field.getScale().x() / 2;
        double halfH = field.getScale().y() / 2;
        return Math.abs(pos.x() - field.getPosition().x()) <= halfW
                && Math.abs(pos.y() - field.getPosition().y()) <= halfH;
    }

    private static boolean isScaleZero(PhysicsElement field) {
        return field.getScale() == null || field.getPosition() == null;
    }
}
