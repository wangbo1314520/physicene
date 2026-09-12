package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

/** SlopeElement 的注册工厂（SRS F2.6：加新元件只加不改）。 */
@Component
public class SlopeElementFactory implements ElementBehaviorFactory {

    @Override
    public String type() {
        return "slope";
    }

    @Override
    public ElementBehavior create(PhysicsElement element) {
        return new SlopeElement(element);
    }
}
