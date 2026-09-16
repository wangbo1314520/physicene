package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class PulleyElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "pulley"; }
    @Override
    public ElementBehavior create(PhysicsElement element) { return new PulleyElement(element); }
}
