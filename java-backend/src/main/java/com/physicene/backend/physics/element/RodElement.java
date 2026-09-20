package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 轻杆（方案 §3.3）：DistanceJoint 刚性定长（弹簧关闭、限位关闭）——可拉可压。
 * D5 注（2026-09-20）：RopeElement 已改冲量式（createJoint 返回 null），杆保持
 * dyn4j DistanceJoint 刚性语义——super.createJoint 只负责 bodyA/bodyB 与悬点微刚体准备，
 * 关节由本类自建（旧绳实现的整体迁移）。
 */
public class RodElement extends RopeElement {

    public RodElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "rod";
    }

    @Override
    public Joint<Body> createJoint(World<Body> world, Map<String, Body> bodies) {
        super.createJoint(world, bodies);   // 准备 bodyA/bodyB（含悬点 INFINITE 微刚体）
        double[] wa = anchorWorld(getBodyA(), data().getAnchorA());
        double[] wb = otherEndWorldOf();
        DistanceJoint<Body> joint = new DistanceJoint<>(getBodyA(), getBodyB(),
                new org.dyn4j.geometry.Vector2(wa[0], wa[1]), new org.dyn4j.geometry.Vector2(wb[0], wb[1]));
        double length = param("jointLength", joint.getCurrentDistance());
        joint.setUpperLimitEnabled(false);
        joint.setLowerLimitEnabled(false);
        joint.setSpringEnabled(false);
        joint.setRestDistance(length);
        world.addJoint(joint);
        return joint;
    }
}
