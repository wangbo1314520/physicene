package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.geometry.Capsule;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/**
 * 传送带（方案 §3.1）：固定 Capsule 体 + 每步接触切向速度（ContactConstraint.setTangentSpeed）。
 * 带速沿本地 +x（角度 angle 旋转后为世界方向）；顶面 y=+radius。摩擦由 fixture.friction 提供。
 * 物理钩子在 SimulationInstance 的 BeltContactListener（需全局接触回调，元件侧只声明参数）。
 */
public class BeltElement extends AbstractMechanicalElement {

    public BeltElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "belt";
    }

    @Override
    protected Convex buildShape() {
        double length = Math.max(0.2, param("beltLength", data.getScale().x()));
        double radius = Math.max(0.02, param("beltRadius", 0.15));
        return Geometry.createCapsule(length, radius);
    }

    @Override
    protected double momentOfInertia(double mass) {
        return 0; // 固定体不使用
    }

    public double beltSpeed() {
        return param("beltSpeed", 0.0);
    }

    double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
