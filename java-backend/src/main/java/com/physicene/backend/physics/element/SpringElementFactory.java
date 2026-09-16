package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class SpringElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "spring"; }
    @Override
    public ElementBehavior create(PhysicsElement element) { return new SpringElement(element); }
}
