package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.dynamics.joint.PulleyJoint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 滑轮（dyn4j PulleyJoint）：|A−P₁| + ratio·|B−P₂| = L。
 * ratio=1 双定滑轮=阿特伍德；ratio=2 省力绳组 v_A=2·v_B。
 * 构造序（反编译实锤）：PulleyJoint(b1, b2, 滑轮锚1, 滑轮锚2, 机体锚1, 机体锚2)。
 * 滑轮锚 = 元件 position + pulley1dx/dy、pulley2dx/dy（两锚须分离且绳段竖直，共点会退化震荡）。
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
        double a1x = p.x() + param("pulley1dx", 0.0), a1y = p.y() + param("pulley1dy", 0.0);
        double a2x = p.x() + param("pulley2dx", 0.0), a2y = p.y() + param("pulley2dy", 0.0);
        double ratio = param("ratio", 1.0);
        PulleyJoint<Body> joint = new PulleyJoint<>(a, b,
                new org.dyn4j.geometry.Vector2(a1x, a1y), new org.dyn4j.geometry.Vector2(a2x, a2y),
                new org.dyn4j.geometry.Vector2(wa.x(), wa.y()),
                new org.dyn4j.geometry.Vector2(wb.x(), wb.y()));
        joint.setRatio(ratio == 2 ? 2.0 : 1.0);
        world.addJoint(joint);
        return joint;
    }

    protected double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
