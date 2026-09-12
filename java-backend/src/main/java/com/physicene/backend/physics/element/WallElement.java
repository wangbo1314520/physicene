package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/** 墙/地面元件：基准 1×1 矩形，默认固定（isFixed 强制 true），典型用法 scale=(20,0.2) 做地面。 */
public class WallElement extends AbstractMechanicalElement {

    public WallElement(PhysicsElement data) {
        super(forceFixed(data));
    }

    private static PhysicsElement forceFixed(PhysicsElement data) {
        data.setFixed(true); // 墙体语义固定，SRS F2.1 模板地面即 wall
        return data;
    }

    @Override
    public String getType() {
        return "wall";
    }

    @Override
    protected Convex buildShape() {
        double w = Math.max(0.05, data.getScale().x());
        double h = Math.max(0.05, data.getScale().y());
        return Geometry.createRectangle(w, h);
    }

    @Override
    protected double momentOfInertia(double mass) {
        return 0; // 固定体不使用惯量
    }
}
