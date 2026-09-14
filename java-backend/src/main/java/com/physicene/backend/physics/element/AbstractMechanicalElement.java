package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Mass;
import org.dyn4j.geometry.MassType;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;

/**
 * 力学元件公共基类：质量/固定/初速度/摩擦弹性/空气阻力的统一装配。
 * 新元件继承本类只需提供几何形状与转动惯量（"加新元件只加不改"，SRS 4.5）。
 */
public abstract class AbstractMechanicalElement implements ElementBehavior {

    protected final PhysicsElement data;

    protected AbstractMechanicalElement(PhysicsElement data) {
        this.data = data;
    }

    /** 子类提供基准几何（已按 scale 缩放，中心在原点） */
    protected abstract Convex buildShape();

    /** 子类提供绕质心转动惯量 */
    protected abstract double momentOfInertia(double mass);

    @Override
    public String ownId() {
        return data.getId();
    }

    /** 子类定制 fixture（场区域元件设 sensor 免碰撞） */
    protected void customizeFixture(BodyFixture fixture) {
    }

    @Override
    public Body createBody(World<Body> world) {
        Body body = new Body();
        BodyFixture fixture = body.addFixture(buildShape());
        fixture.setFriction(data.getProperties().getFriction());
        fixture.setRestitution(data.getProperties().getRestitution());
        customizeFixture(fixture);

        if (data.isFixed()) {
            body.setMass(MassType.INFINITE);
        } else {
            double m = data.getProperties().getMass();
            body.setMass(new Mass(new Vector2(0, 0), m, momentOfInertia(m)));
        }

        body.rotate(data.getAngle());
        body.translate(data.getPosition().x(), data.getPosition().y());

        Vector2D v0 = data.getInitialState().getVelocity();
        body.setLinearVelocity(v0.x(), v0.y());
        body.setAngularVelocity(data.getInitialState().getAngularVelocity());

        body.setUserData(data.getId());
        world.addBody(body);
        return body;
    }

    @Override
    public void updateState(Body body, double dt) {
        // 空气阻力经线性阻尼近似（仅开关开启时；F2.3 的 L3 警告由 validate 负责）
    }
}
