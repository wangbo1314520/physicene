package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class SensorElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "accel_sensor"; }

    @Override
    public ElementBehavior create(PhysicsElement data) { return new SensorElement(data); }
}
