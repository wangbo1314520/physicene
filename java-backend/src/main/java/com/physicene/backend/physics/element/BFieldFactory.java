package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

/** 匀强磁场区域注册工厂。 */
@Component
public class BFieldFactory implements ElementBehaviorFactory {

    @Override
    public String type() {
        return "b_field";
    }

    @Override
    public ElementBehavior create(PhysicsElement element) {
        return new FieldRegionElements.BFieldElement(element);
    }
}
