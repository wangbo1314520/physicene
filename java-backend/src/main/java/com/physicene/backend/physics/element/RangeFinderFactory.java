package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class RangeFinderFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "range_finder"; }

    @Override
    public ElementBehavior create(PhysicsElement data) { return new SensorElement(data); }
}
