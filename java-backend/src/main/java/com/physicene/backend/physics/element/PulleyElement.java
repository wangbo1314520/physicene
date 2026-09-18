package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 滑轮（冲量式绳约束 + Baumgarte 稳定化，阶段三·五 D1 重构）：弃用 dyn4j PulleyJoint（实测过软）与
 * 罚力对（5s 阿特伍德能量漂移 12.96%）。
 * 力学模型：轻绳张力处处相等。约束 C = L − L₀ = (|A−P₁| + ratio·|B−P₂|) − L₀ ≥ 0（单边：绳不抗压）。
 * 速度约束 J·v = Ċ = −(vA·û₁ + ratio·vB·û₂)，雅可比 J_A = −û₁、J_B = −ratio·û₂。
 * 每子步（world.step 前）施加冲量 λ = −((1+γ)·J·v + β·max(C,0)/h) · M_eff，
 * M_eff = 1/(1/m_A + ratio²/m_B)；λ<0 为张力（绷紧），λ≥0 松弛不施力。
 * P_A = λ·J_A = −λ·û₁（拉 A 向滑轮），P_B = −ratio·λ·û₂；速度级求解 + Baumgarte 位置偏置，
 * 无刚度项 → 无罚力法的能量注入/耗散。动滑轮 ratio=2 → v_A=2·v_B 由雅可比自然保证。
 */
public class PulleyElement implements ElementBehavior, JointBehavior {

    /** Baumgarte 位置稳定化系数（验收定案 β=0.2 γ=0.1） */
    public static final double BETA = 0.2;
    public static final double GAMMA = 0.1;

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
        return null; // 冲量不走 dyn4j 关节（求解器语义见类注释）
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

    /**
     * 每子步施加冲量式约束（SimulationInstance 在 world.step 前调用，h = dt/substeps）。
     * 返回张力冲量 |λ|（≤0 表示绳松弛未施力）。
     */
    public double applyImpulse(double h) {
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

        double c = (l1 + r * l2) - restLength;         // 位置约束违反量
        if (c <= 0) {
            return 0; // 绳松弛（不可伸长且不抗压）
        }
        // J·v = Ċ = −(vA·û₁ + ratio·vB·û₂)
        double jv = -((bodyA.getLinearVelocity().x * u1x + bodyA.getLinearVelocity().y * u1y)
                + r * (bodyB.getLinearVelocity().x * u2x + bodyB.getLinearVelocity().y * u2y));

        double invMassA = invMass(bodyA), invMassB = invMass(bodyB);
        double invEff = invMassA + r * r * invMassB;   // 1/M_eff
        if (invEff <= 0) {
            return 0;
        }
        double lambda = -((1 + GAMMA) * jv + BETA * c / h) / invEff;
        if (lambda >= 0) {
            return 0; // 张力为负才绷紧（λ<0：冲量把两体拉向滑轮）
        }
        // P_A = λ·J_A = −λ·û₁ > 0 方向 û₁（拉 A 向滑轮）；P_B = −r·λ·û₂
        bodyA.applyImpulse(new org.dyn4j.geometry.Vector2(-lambda * u1x, -lambda * u1y));
        bodyB.applyImpulse(new org.dyn4j.geometry.Vector2(-r * lambda * u2x, -r * lambda * u2y));
        return -lambda;
    }

    private static double invMass(Body b) {
        double m = b.getMass().getMass();
        return (m <= 0 || Double.isInfinite(m)) ? 0 : 1.0 / m;
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
