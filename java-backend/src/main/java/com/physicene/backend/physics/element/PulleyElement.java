package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 滑轮（自研绳段罚力，教材精确解）：弃用 dyn4j PulleyJoint（实测求解过软：阿特伍德 a 仅理论 8%，比例 1.76 vs 2）。
 * 力学模型：轻绳张力处处相等。约束 L = |A−P₁| + ratio·|B−P₂|，罚力 f = k·(L−L₀) + c·dL/dt（k 对质量归一）。
 * A 受 −f·û₁（沿 A 段绳向），B 受 −ratio·f·û₂（动滑轮 B 段位移敏感度 = ratio）。
 * 定滑轮 ratio=1 → 阿特伍德 a=(m₁−m₂)g/(m₁+m₂)；动滑轮 ratio=2 → v_A=2·v_B，由约束雅可比自然保证。
 * 要求 substeps≥4（与圆轨道导轨同套数值参数）。
 */
public class PulleyElement implements ElementBehavior, JointBehavior {

    private final PhysicsElement data;
    private Body bodyA;
    private Body bodyB;
    private double restLength;

    public PulleyElement(PhysicsElement data) {
        this.data = data;
    }

    @Override
    public String getType() {
        return "pulley";
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
        bodyA = bodies.get(data.getConnectTo());
        bodyB = bodies.get(data.getConnectTo2());
        if (bodyA == null || bodyB == null) {
            throw new IllegalArgumentException("pulley " + data.getId()
                    + " 需要 connectTo 与 connectTo2 两个本体，实际: "
                    + data.getConnectTo() + " / " + data.getConnectTo2());
        }
        restLength = currentLength();
        return null; // 力对不走关节
    }

    private double ratio() {
        return param("ratio", 1.0) == 2 ? 2.0 : 1.0;
    }

    private double currentLength() {
        Vector2D p = data.getPosition();
        double a1x = p.x() + param("pulley1dx", 0.0), a1y = p.y() + param("pulley1dy", 0.0);
        double a2x = p.x() + param("pulley2dx", 0.0), a2y = p.y() + param("pulley2dy", 0.0);
        double l1 = Math.hypot(bodyA.getTransform().getTranslationX() - a1x,
                bodyA.getTransform().getTranslationY() - a1y);
        double l2 = Math.hypot(bodyB.getTransform().getTranslationX() - a2x,
                bodyB.getTransform().getTranslationY() - a2y);
        return l1 + ratio() * l2;
    }

    /** 每子步计算并施加绳张力对：返回当前张力（>0 绷紧；≤0 松弛不施力——绳不抗压） */
    public double applyRopeForce() {
        if (bodyA == null || bodyB == null) {
            return 0;
        }
        Vector2D p = data.getPosition();
        double a1x = p.x() + param("pulley1dx", 0.0), a1y = p.y() + param("pulley1dy", 0.0);
        double a2x = p.x() + param("pulley2dx", 0.0), a2y = p.y() + param("pulley2dy", 0.0);
        double r = ratio();

        double ax = bodyA.getTransform().getTranslationX(), ay = bodyA.getTransform().getTranslationY();
        double bx = bodyB.getTransform().getTranslationX(), by = bodyB.getTransform().getTranslationY();
        double d1x = a1x - ax, d1y = a1y - ay;         // A 指向滑轮1
        double d2x = a2x - bx, d2y = a2y - by;         // B 指向滑轮2
        double l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
        if (l1 < 1e-9 || l2 < 1e-9) {
            return 0;
        }
        double u1x = d1x / l1, u1y = d1y / l1;         // A 段绳单位向量（A→P₁）
        double u2x = d2x / l2, u2y = d2y / l2;         // B 段绳单位向量（B→P₂）

        double length = l1 + r * l2;
        // dL/dt = −(vA·û₁ + ratio·vB·û₂)
        double dL = -((bodyA.getLinearVelocity().x * u1x + bodyA.getLinearVelocity().y * u1y)
                + r * (bodyB.getLinearVelocity().x * u2x + bodyB.getLinearVelocity().y * u2y));

        double lambda = length - restLength;
        if (lambda <= 0) {
            return 0; // 绳松弛（不可伸长且不抗压）
        }
        double mRed = reducedMass(u1x, u1y, u2x, u2y, r);
        double k = 4000.0;
        double c = 2.0 * Math.sqrt(k) * 0.7;           // 近临界阻尼防接缝噪声
        double f = mRed * (k * lambda + c * dL);       // 绳张力（>0）
        if (f <= 0) {
            return 0;
        }

        // A 段：张力拉 A 向滑轮1方向；B 段：约束雅可比给 B 的敏感度是 ratio
        bodyA.applyForce(new org.dyn4j.geometry.Vector2(f * u1x, f * u1y));
        bodyB.applyForce(new org.dyn4j.geometry.Vector2(r * f * u2x, r * f * u2y));
        return f;
    }

    /** 沿约束方向的等效质量：1/M = 1/m_A + ratio²/m_B（忽略锚固定） */
    private double reducedMass(double u1x, double u1y, double u2x, double u2y, double r) {
        double mA = bodyA.getMass().getMass();
        double mB = bodyB.getMass().getMass();
        boolean infA = mA <= 0 || Double.isInfinite(mA);
        boolean infB = mB <= 0 || Double.isInfinite(mB);
        double inv = 0;
        if (!infA) {
            inv += 1.0 / mA;
        }
        if (!infB) {
            inv += r * r / mB;
        }
        return inv > 0 ? 1.0 / inv : 1.0;
    }

    public double getRestLength() {
        return restLength;
    }

    public double getCurrentLength() {
        return bodyA != null && bodyB != null ? currentLength() : restLength;
    }

    protected double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
