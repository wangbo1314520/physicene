package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class RopeElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "rope"; }
    @Override
    public ElementBehavior create(PhysicsElement element) { return new RopeElement(element); }
}
