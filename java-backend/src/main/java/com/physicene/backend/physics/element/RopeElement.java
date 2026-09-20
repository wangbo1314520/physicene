package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 轻绳（D5 冲量式重构，2026-09-20）：弃用 DistanceJoint limit 模式——其 getReactionForce 恒 0，
 * 无法读张力做断裂判定（第十五轮实测，交接文档 E-OPEN）。
 * 力学模型（与 PulleyElement 同框架，β=0.2/γ=0.1 同参）：不可伸长上限约束
 *   C = |P_A − P_B| − L ≤ 0（松弛 C<0 自由；绷紧 C>0 时施约束冲量阻止进一步分离）
 * 锚点级求解（绳摆精度要求）：锚点世界 = body 位置 + R(angle)·anchor；
 *   锚点速度 = v + ω×r；invEff = Σ(1/m + (r×û)²/I)；冲量施加在锚点上（含扭矩）。
 * 断裂（D5）：张力 T = −λ/h > tMax → broken，此后不施力；rope_break 事件由
 *   SimulationInstance 判定发射（applyImpulse 返回当子步张力，0=松弛/已断）。
 * connectTo2 为空时：另一端固定在元件自身 position（悬点，锚点=position，INFINITE 微刚体承载）。
 */
public class RopeElement implements ElementBehavior, JointBehavior {

    /** Baumgarte 系数与滑轮同参（验收定案 β=0.2 γ=0.1） */
    public static final double BETA = 0.2;
    public static final double GAMMA = 0.1;

    private final PhysicsElement data;
    private Body bodyA;
    private Body bodyB;
    private boolean broken;

    public RopeElement(PhysicsElement data) {
        this.data = data;
    }

    @Override
    public String getType() {
        return "rope";
    }

    @Override
    public String ownId() {
        return data.getId();
    }

    @Override
    public Body createBody(World<Body> world) {
        return null; // 关节元件无刚体
    }

    @Override
    public Joint<Body> createJoint(World<Body> world, Map<String, Body> bodies) {
        bodyA = bodies.get(data.getConnectTo());
        if (bodyA == null) {
            throw new IllegalArgumentException("rope " + data.getId() + " 连接对象不存在: " + data.getConnectTo());
        }
        bodyB = bodies.get(data.getConnectTo2());
        if (bodyB == null) {
            // 悬点：绳元件自身 position 为固定端，INFINITE 微刚体承载（锚点=position，无旋转）
            Vector2D ap = data.getPosition() == null ? new Vector2D(0, 0) : data.getPosition();
            Body anchor = new Body();
            anchor.addFixture(new org.dyn4j.geometry.Circle(0.01));
            anchor.setMass(org.dyn4j.geometry.MassType.INFINITE);
            anchor.translate(ap.x(), ap.y());
            anchor.setUserData(data.getId() + "#anchor");
            world.addBody(anchor);
            bodies.put(data.getId() + "#anchor", anchor);
            bodyB = anchor;
        }
        return null; // 冲量不走 dyn4j 关节
    }

    /** 绳长 L（参数为准；缺省取初始锚距） */
    public double length() {
        return param("jointLength", initialDistance());
    }

    /** 最大承受力（无参数=无穷，不断） */
    public double tMax() {
        return param("tMax", Double.POSITIVE_INFINITY);
    }

    private double initialDistance() {
        double[] a = anchorWorld(bodyA, data.getAnchorA());
        double[] pb = otherEndWorld();
        return Math.hypot(a[0] - pb[0], a[1] - pb[1]);
    }

    /** B 端锚世界（双体=bodyB 锚点；悬点=元件 position） */
    private double[] otherEndWorld() {
        if (data.getConnectTo2() == null && data.getPosition() != null) {
            Vector2D p = data.getPosition();
            return new double[]{ p.x(), p.y() };
        }
        return anchorWorld(bodyB, data.getAnchorB());
    }

    /** 锚点世界坐标：body 位置 + R(angle)·anchor（anchor 为连体局部坐标；悬点 body 无旋转亦适用） */
    protected static double[] anchorWorld(Body body, Vector2D anchor) {
        double ang = body.getTransform().getRotationAngle();
        double c = Math.cos(ang), s = Math.sin(ang);
        double ax = anchor == null ? 0 : anchor.x(), ay = anchor == null ? 0 : anchor.y();
        return new double[]{ body.getTransform().getTranslationX() + c * ax - s * ay,
                body.getTransform().getTranslationY() + s * ax + c * ay };
    }

    /**
     * 每子步施加冲量式约束（SimulationInstance 在 world.step 前调用，h = dt/substeps）。
     * 返回当子步张力（牛顿；0 = 松弛或已断）。张力 = −λ/h（λ<0 为绷紧拉回冲量）。
     */
    public double applyImpulse(double h) {
        if (broken || bodyA == null || bodyB == null) {
            return 0;
        }
        double[] pa = anchorWorld(bodyA, data.getAnchorA());
        double[] pb = otherEndWorld();
        double dx = pb[0] - pa[0], dy = pb[1] - pa[1];
        double d = Math.hypot(dx, dy);
        if (d < 1e-9) {
            return 0;
        }
        double ux = dx / d, uy = dy / d;   // A→B 绳向
        double c = d - length();
        if (c <= 0) {
            return 0; // 松弛（不可伸长且不抗压）
        }
        // 锚点速度（含 ω×r）：A、B 各自
        double[] va = anchorVelocity(bodyA, data.getAnchorA());
        double[] vb = (data.getConnectTo2() == null && data.getPosition() != null)
                ? new double[]{0, 0}
                : anchorVelocity(bodyB, data.getAnchorB());
        double jv = (vb[0] - va[0]) * ux + (vb[1] - va[1]) * uy;  // 分离率 Ċ

        double invEff = invEffAlong(bodyA, data.getAnchorA(), ux, uy)
                + invEffAlong(bodyB, data.getAnchorB(), ux, uy);
        if (invEff <= 0) {
            return 0;
        }
        double lambda = -((1 + GAMMA) * jv + BETA * c / h) / invEff;
        if (lambda >= 0) {
            return 0; // 无拉回需求（约束满足）
        }
        // 冲量 −λ·û 施加在两锚点上（A 被 û 拉向 B，B 被 −û 拉向 A；点冲量自动含扭矩）
        org.dyn4j.geometry.Vector2 impA = new org.dyn4j.geometry.Vector2(-lambda * ux, -lambda * uy);
        bodyA.applyImpulse(impA, new org.dyn4j.geometry.Vector2(pa[0], pa[1]));
        bodyB.applyImpulse(impA.getNegative(), new org.dyn4j.geometry.Vector2(pb[0], pb[1]));
        return -lambda / h;  // 张力（N）
    }

    private static double[] anchorVelocity(Body body, Vector2D anchor) {
        double ang = body.getTransform().getRotationAngle();
        double c = Math.cos(ang), s = Math.sin(ang);
        double ax = anchor == null ? 0 : anchor.x(), ay = anchor == null ? 0 : anchor.y();
        double rx = c * ax - s * ay, ry = s * ax + c * ay;   // 锚偏移（世界系）
        double w = body.getAngularVelocity();
        return new double[]{ body.getLinearVelocity().x - w * ry,
                body.getLinearVelocity().y + w * rx };
    }

    /** 沿方向 û 的有效质量倒数：1/m + (r×û)²/I（INFINITE 体两项为 0） */
    private static double invEffAlong(Body body, Vector2D anchor, double ux, double uy) {
        double m = body.getMass().getMass();
        if (m <= 0 || Double.isInfinite(m)) {
            return 0;
        }
        double ang = body.getTransform().getRotationAngle();
        double c = Math.cos(ang), s = Math.sin(ang);
        double ax = anchor == null ? 0 : anchor.x(), ay = anchor == null ? 0 : anchor.y();
        double rx = c * ax - s * ay, ry = s * ax + c * ay;
        double I = body.getMass().getInertia();
        double cross = rx * uy - ry * ux;   // r×û
        return 1.0 / m + (I > 0 && !Double.isInfinite(I) ? cross * cross / I : 0);
    }

    public boolean isBroken() {
        return broken;
    }

    public void markBroken() {
        this.broken = true;
    }

    /** 当前锚距（绷紧/松弛检测与前端状态用） */
    public double currentDistance() {
        if (bodyA == null || bodyB == null) {
            return length();
        }
        double[] a = anchorWorld(bodyA, data.getAnchorA());
        double[] pb = otherEndWorld();
        return Math.hypot(pb[0] - a[0], pb[1] - a[1]);
    }

    public Body getBodyA() { return bodyA; }

    public Body getBodyB() { return bodyB; }

    protected double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }

    /** 供子类（RodElement 自建 DistanceJoint）访问元件数据与 B 端世界坐标 */
    protected PhysicsElement data() {
        return data;
    }

    protected double[] otherEndWorldOf() {
        return otherEndWorld();
    }
}
