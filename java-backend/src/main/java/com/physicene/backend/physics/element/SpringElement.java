package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 弹簧（教材精确解）：不再用 dyn4j DistanceJoint 弹簧模式（实测刚度模式有效 k=k/4，
 * 频率模式周期×2——与教学口径不符），改为直接计算胡克力对 ±[k(L−L₀)+c·dL/dt]
 * 施加到两端刚体：k 即 N/m，周期 2π√(m_red/k) 精确成立（UnifyPhase1Test 断言 0.8112s）。
 */
public class SpringElement implements ElementBehavior, JointBehavior {

    private final PhysicsElement data;

    public SpringElement(PhysicsElement data) {
        this.data = data;
    }

    @Override
    public String getType() {
        return "spring";
    }

    @Override
    public String ownId() {
        return data.getId();
    }

    @Override
    public Body createBody(World<Body> world) {
        return null;
    }

    @Override
    public Joint<Body> createJoint(World<Body> world, Map<String, Body> bodies) {
        Body a = bodies.get(data.getConnectTo());
        if (a == null) {
            throw new IllegalArgumentException("spring " + data.getId() + " 连接对象不存在: " + data.getConnectTo());
        }
        // 另一端：connectTo2 或元件自身 position 的固定微刚体（与绳一致）
        Body b = bodies.get(data.getConnectTo2());
        if (b == null) {
            Vector2D p = data.getPosition();
            Body anchor = new Body();
            anchor.addFixture(new org.dyn4j.geometry.Circle(0.01));
            anchor.setMass(org.dyn4j.geometry.MassType.INFINITE);
            anchor.translate(p.x(), p.y());
            anchor.setUserData(data.getId() + "#anchor");
            world.addBody(anchor);
            bodies.put(data.getId() + "#anchor", anchor);
            b = anchor;
        }
        this.bodyA = a;
        this.bodyB = b;
        this.rest = param("jointLength",
                Math.hypot(a.getTransform().getTranslationX() - b.getTransform().getTranslationX(),
                        a.getTransform().getTranslationY() - b.getTransform().getTranslationY()));
        return null; // 力对不走关节
    }

    private Body bodyA;
    private Body bodyB;
    private double rest;

    @Override
    public boolean hasCustomForce() {
        return true;
    }

    /** 胡克力对：A 受沿 AB 方向的 −(kΔL + c·dΔL/dt)，B 受反作用（由 SimulationInstance 成对施加） */
    public double[] springForce() {
        if (bodyA == null || bodyB == null) {
            return null;
        }
        double dx = bodyB.getTransform().getTranslationX() - bodyA.getTransform().getTranslationX();
        double dy = bodyB.getTransform().getTranslationY() - bodyA.getTransform().getTranslationY();
        double dist = Math.hypot(dx, dy);
        if (dist < 1e-9) {
            return null;
        }
        double ux = dx / dist, uy = dy / dist;
        double relV = (bodyB.getLinearVelocity().x - bodyA.getLinearVelocity().x) * ux
                + (bodyB.getLinearVelocity().y - bodyA.getLinearVelocity().y) * uy;
        double k = param("stiffness", 100.0);
        double c = 2.0 * Math.sqrt(k * reducedMass()) * param("dampingRatio", 0.05);
        double f = k * (dist - rest) + c * relV; // >0 = 拉伸，A 被拉向 B
        return new double[]{f * ux, f * uy};
    }

    private double reducedMass() {
        double m1 = bodyA.getMass().getMass();
        double m2 = bodyB.getMass().getMass();
        boolean inf1 = m1 <= 0 || Double.isInfinite(m1);
        boolean inf2 = m2 <= 0 || Double.isInfinite(m2);
        if (inf1 && inf2) {
            return 1.0;
        }
        if (inf1) {
            return m2;
        }
        if (inf2) {
            return m1;
        }
        return m1 * m2 / (m1 + m2);
    }

    public double getRestLength() {
        return rest;
    }

    public Body getBodyA() {
        return bodyA;
    }

    public Body getBodyB() {
        return bodyB;
    }

    protected double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
