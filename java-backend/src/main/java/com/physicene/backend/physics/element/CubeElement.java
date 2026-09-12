package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/** 方块元件：基准 1×1 正方形，scale 为宽高倍数。 */
public class CubeElement extends AbstractMechanicalElement {

    public CubeElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "cube";
    }

    @Override
    protected Convex buildShape() {
        double w = Math.max(0.05, data.getScale().x());
        double h = Math.max(0.05, data.getScale().y());
        return Geometry.createRectangle(w, h);
    }

    @Override
    protected double momentOfInertia(double mass) {
        double w = Math.max(0.05, data.getScale().x());
        double h = Math.max(0.05, data.getScale().y());
        return mass * (w * w + h * h) / 12.0;
    }
}
