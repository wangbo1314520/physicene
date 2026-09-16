package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class RodElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "rod"; }
    @Override
    public ElementBehavior create(PhysicsElement element) { return new RodElement(element); }
}
