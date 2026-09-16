package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.HashMap;
import java.util.Map;

/**
 * 轻绳（方案 §3.3）：DistanceJoint 只开上限约束——
 * 当前距离 &lt; 上限时松弛自由（绳可弯），&gt; 上限时刚抗拉不抗压，即绳的物理语义。
 * connectTo2 为空时：绳的另一端固定在元件自身 position（悬点/摆锚）。
 */
public class RopeElement implements ElementBehavior, JointBehavior {

    private final PhysicsElement data;

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
        Body a = bodies.get(data.getConnectTo());
        if (a == null) {
            throw new IllegalArgumentException("rope " + data.getId() + " 连接对象不存在: " + data.getConnectTo());
        }
        Vector2D wa = JointBehavior.anchorWorld(data, data.getAnchorA(), a,
                data.getPosition() == null ? new Vector2D(0, 0) : data.getPosition());
        Body b = bodies.get(data.getConnectTo2());
        Vector2D wb;
        if (b != null) {
            wb = JointBehavior.anchorWorld(data, data.getAnchorB(), b, wa);
        } else {
            // 悬点：由 rope 元件自身位置充当（固定端），用一颗固定微刚体承载关节
            Body anchor = new Body();
            anchor.addFixture(new org.dyn4j.geometry.Circle(0.01));
            anchor.setMass(org.dyn4j.geometry.MassType.INFINITE);
            anchor.translate(wa.x(), wa.y());
            anchor.setUserData(data.getId() + "#anchor");
            anchor.setBullet(false);
            world.addBody(anchor);
            bodies.put(data.getId() + "#anchor", anchor);
            b = anchor;
            wb = wa;
        }
        DistanceJoint<Body> joint = new DistanceJoint<>(a, b,
                new org.dyn4j.geometry.Vector2(wa.x(), wa.y()), new org.dyn4j.geometry.Vector2(wb.x(), wb.y()));
        double length = param("jointLength", joint.getCurrentDistance());
        joint.setUpperLimit(length);
        joint.setUpperLimitEnabled(true);
        joint.setLowerLimitEnabled(false);
        joint.setSpringEnabled(false);
        world.addJoint(joint);
        return joint;
    }

    protected double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
