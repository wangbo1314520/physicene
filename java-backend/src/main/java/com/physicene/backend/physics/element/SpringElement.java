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
                Math.hypot(anchorPoints()[2] - anchorPoints()[0], anchorPoints()[3] - anchorPoints()[1]));
        return null; // 力对不走关节
    }

    private Body bodyA;
    private Body bodyB;
    private double rest;

    @Override
    public boolean hasCustomForce() {
        return true;
    }

    /**
     * 胡克力对（锚点语义，任务E·第5失败模式修复）：力沿「A 锚点 ↔ B 锚点」连线，而非中心连线。
     * 原实现量/施力均用刚体中心——块心离面 0.5m、锚在面上时力线不平行斜面，压缩段法向分量
     * 94N×0.68≈64N ≫ mg·cosθ=8.5N，把块推离面成弹簧摆（斜面弹簧模板五种失败模式之根因；
     * 水平场景中心连线=锚点连线故未暴露）。返回 {Fx, Fy, ax, ay}：A 在其锚点受 (Fx,Fy)，
     * B 在其锚点受反作用（SimulationInstance 成对施加于作用点，含力矩）。
     */
    public double[] springForce() {
        if (bodyA == null || bodyB == null) {
            return null;
        }
        double[] aw = anchorPoints();
        double dx = aw[2] - aw[0], dy = aw[3] - aw[1];
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
        return new double[]{f * ux, f * uy, aw[0], aw[1]};
    }

    /** A/B 的锚点世界坐标 {ax, ay, bx, by}（anchorA/anchorB 为空用中心；B 为固定微刚体时即其位置=锚） */
    public double[] anchorPointsPublic() { return anchorPoints(); }

    private double[] anchorPoints() {
        double ax = bodyA.getTransform().getTranslationX(), ay = bodyA.getTransform().getTranslationY();
        if (data.getAnchorA() != null) {
            double c = Math.cos(bodyA.getTransform().getRotationAngle()), sn = Math.sin(bodyA.getTransform().getRotationAngle());
            ax += c * data.getAnchorA().x() - sn * data.getAnchorA().y();
            ay += sn * data.getAnchorA().x() + c * data.getAnchorA().y();
        }
        double bx = bodyB.getTransform().getTranslationX(), by = bodyB.getTransform().getTranslationY();
        if (data.getConnectTo2() != null && data.getAnchorB() != null) {
            double c = Math.cos(bodyB.getTransform().getRotationAngle()), sn = Math.sin(bodyB.getTransform().getRotationAngle());
            bx += c * data.getAnchorB().x() - sn * data.getAnchorB().y();
            by += sn * data.getAnchorB().x() + c * data.getAnchorB().y();
        }
        return new double[]{ax, ay, bx, by};
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
