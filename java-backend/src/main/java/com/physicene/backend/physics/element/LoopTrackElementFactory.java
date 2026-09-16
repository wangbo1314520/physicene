package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

@Component
public class LoopTrackElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "loop_track"; }
    @Override
    public ElementBehavior create(PhysicsElement element) { return new LoopTrackElement(element); }
}
