package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class BeltElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "belt"; }
    @Override
    public ElementBehavior create(PhysicsElement element) { return new BeltElement(element); }
}
