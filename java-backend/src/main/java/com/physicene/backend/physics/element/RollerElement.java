package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/**
 * 转动惯量滚动件（任务 E：hoop/disc/ball 三件统一类型 rigid_roller，k 参数化）。
 * I = k·m·R²，k ∈ {1（圆环）, 0.5（圆盘）, 0.4（球）}——高考/竞赛刚体滚动核心。
 * 滚动靠摩擦力矩驱动（静摩擦，不建滚动摩阻——教学简化）。
 * 滚下斜面：a = g·sinθ/(1+k)；纯滚动条件 v=ωR；打滑临界 μ_c = k·tanθ/(1+k)。
 */
public class RollerElement extends AbstractMechanicalElement {

    public RollerElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "rigid_roller";
    }

    @Override
    protected Convex buildShape() {
        double r = radius();
        return Geometry.createCircle(r);
    }

    private double radius() {
        double sx = Math.max(0.05, data.getScale().x());
        double sy = Math.max(0.05, data.getScale().y());
        return 0.5 * (sx + sy) / 2.0;  // 与 SphereElement 一致：R=0.5·(sx+sy)/2，默认 R=0.5
    }

    /** k = I/(mR²)：hoop 1 / disc 0.5 / ball 0.4（param "k"，默认 0.5 圆盘） */
    private double kCoeff() {
        Double v = data.getParams() == null ? null : data.getParams().get("k");
        return v == null ? 0.5 : v;
    }

    @Override
    protected double momentOfInertia(double mass) {
        double r = radius();
        return kCoeff() * mass * r * r;
    }
}
