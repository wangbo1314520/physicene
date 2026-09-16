package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/** 轻杆（方案 §3.3）：DistanceJoint 刚性定长（弹簧关闭、限位关闭）——可拉可压。 */
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
        DistanceJoint<Body> joint = (DistanceJoint<Body>) super.createJoint(world, bodies);
        double length = p("jointLength", joint.getCurrentDistance());
        joint.setUpperLimitEnabled(false);
        joint.setLowerLimitEnabled(false);
        joint.setSpringEnabled(false);
        joint.setRestDistance(length);
        return joint;
    }

    private double p(String key, double def) {
        return param(key, def);
    }
}
