package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.dynamics.joint.PulleyJoint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 滑轮（方案 §3.3）：dyn4j PulleyJoint。
 *  ratio=1 定滑轮：两段绳同长变化（|b1−P|+|b2−P|=L），即阿特伍德 / 改向滑轮；
 *  ratio=2 动滑轮：|施力端−P| + 2·|负载−P| = L（两个滑轮锚同为悬点 P），a_施力 = 2·a_负载。
 *  施力端=connectTo，负载端=connectTo2，元件 position=悬点。
 */
public class PulleyElement implements ElementBehavior, JointBehavior {

    private final PhysicsElement data;

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
        Body a = bodies.get(data.getConnectTo());
        Body b = bodies.get(data.getConnectTo2());
        if (a == null || b == null) {
            throw new IllegalArgumentException("pulley " + data.getId()
                    + " 需要 connectTo 与 connectTo2 两个本体，实际: "
                    + data.getConnectTo() + " / " + data.getConnectTo2());
        }
        Vector2D wa = JointBehavior.anchorWorld(data, data.getAnchorA(), a, data.getPosition());
        Vector2D wb = JointBehavior.anchorWorld(data, data.getAnchorB(), b, data.getPosition());
        Vector2D p = data.getPosition();
        org.dyn4j.geometry.Vector2 pv = new org.dyn4j.geometry.Vector2(p.x(), p.y());
        double ratio = param("ratio", 1.0);
        PulleyJoint<Body> joint = new PulleyJoint<>(a, b,
                new org.dyn4j.geometry.Vector2(wa.x(), wa.y()),
                new org.dyn4j.geometry.Vector2(wb.x(), wb.y()), pv, pv);
        joint.setRatio(ratio == 2 ? 2.0 : 1.0);
        world.addJoint(joint);
        return joint;
    }

    protected double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
