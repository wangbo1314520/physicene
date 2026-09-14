package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Geometry;

/**
 * 场区域元件（V1.5 提前实装）：
 * e_field 匀强电场（eFieldX/eFieldY，N/C 教学量纲）
 * b_field 匀强磁场（bField T + bDirection out/in）
 * 均为 sensor（不产生物理碰撞），对区域内的 point_charge 施力。
 */
public final class FieldRegionElements {

    private FieldRegionElements() {
    }

    public static class EFieldElement extends AbstractMechanicalElement {

        public EFieldElement(PhysicsElement data) {
            super(forceFixed(data));
        }

        @Override
        public String getType() {
            return "e_field";
        }

        @Override
        protected Convex buildShape() {
            return Geometry.createRectangle(Math.max(0.1, data.getScale().x()),
                    Math.max(0.1, data.getScale().y()));
        }

        @Override
        protected void customizeFixture(BodyFixture fixture) {
            fixture.setSensor(true);
        }

        @Override
        protected double momentOfInertia(double mass) {
            return 0;
        }
    }

    public static class BFieldElement extends AbstractMechanicalElement {

        public BFieldElement(PhysicsElement data) {
            super(forceFixed(data));
        }

        @Override
        public String getType() {
            return "b_field";
        }

        @Override
        protected Convex buildShape() {
            return Geometry.createRectangle(Math.max(0.1, data.getScale().x()),
                    Math.max(0.1, data.getScale().y()));
        }

        @Override
        protected void customizeFixture(BodyFixture fixture) {
            fixture.setSensor(true);
        }

        @Override
        protected double momentOfInertia(double mass) {
            return 0;
        }
    }

    private static PhysicsElement forceFixed(PhysicsElement data) {
        data.setFixed(true);
        return data;
    }
}
