package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/** 球元件：基准半径 0.5，scale.x/y 取平均作为半径倍数。 */
public class SphereElement extends AbstractMechanicalElement {

    public SphereElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "sphere";
    }

    @Override
    protected Convex buildShape() {
        double r = 0.5 * Math.max(0.05, (data.getScale().x() + data.getScale().y()) / 2.0);
        return Geometry.createCircle(r);
    }

    @Override
    protected double momentOfInertia(double mass) {
        double r = 0.5 * Math.max(0.05, (data.getScale().x() + data.getScale().y()) / 2.0);
        return 0.5 * mass * r * r;
    }
}
