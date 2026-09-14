package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

/** 匀强电场区域注册工厂。 */
@Component
public class EFieldFactory implements ElementBehaviorFactory {

    @Override
    public String type() {
        return "e_field";
    }

    @Override
    public ElementBehavior create(PhysicsElement element) {
        return new FieldRegionElements.EFieldElement(element);
    }
}
