package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

/** 点电荷注册工厂（加新元件只加不改）。 */
@Component
public class PointChargeFactory implements ElementBehaviorFactory {

    @Override
    public String type() {
        return "point_charge";
    }

    @Override
    public ElementBehavior create(PhysicsElement element) {
        return new PointChargeElement(element);
    }
}
