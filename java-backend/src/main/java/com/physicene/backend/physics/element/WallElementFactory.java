package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

/** WallElement 的注册工厂（SRS F2.6：加新元件只加不改）。 */
@Component
public class WallElementFactory implements ElementBehaviorFactory {

    @Override
    public String type() {
        return "wall";
    }

    @Override
    public ElementBehavior create(PhysicsElement element) {
        return new WallElement(element);
    }
}
