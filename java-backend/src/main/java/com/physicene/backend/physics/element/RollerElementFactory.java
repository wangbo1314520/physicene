package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;

public class RollerElementFactory implements ElementBehaviorFactory {
    @Override
    public String type() { return "rigid_roller"; }

    @Override
    public ElementBehavior create(PhysicsElement data) { return new RollerElement(data); }
}
