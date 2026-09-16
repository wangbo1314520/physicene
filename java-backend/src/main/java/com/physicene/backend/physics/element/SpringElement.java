package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/** 弹簧（方案 §3.3）：DistanceJoint 弹簧模式（频率由 k 与折合质量换算，阻尼比 ζ）——软约束冲量求解，数值稳定。 */
public class SpringElement extends RopeElement {

    public SpringElement(PhysicsElement data) {
        super(data);
    }

    @Override
    public String getType() {
        return "spring";
    }

    @Override
    public Joint<Body> createJoint(World<Body> world, Map<String, Body> bodies) {
        DistanceJoint<Body> joint = (DistanceJoint<Body>) super.createJoint(world, bodies);
        double k = param("stiffness", 100.0);
        double zeta = param("dampingRatio", 0.05);
        double mRed = reducedMass(joint, bodies);
        double freq = Math.sqrt(k / Math.max(1e-9, mRed)) / (2 * Math.PI); // Hz
        joint.setUpperLimitEnabled(false);
        joint.setLowerLimitEnabled(false);
        joint.setSpringEnabled(true);
        joint.setSpringFrequency(Math.min(15.0, Math.max(0.01, freq))); // dyn4j 频率上限截断（>15Hz 已非软约束场景）
        joint.setSpringDampingRatio(Math.min(0.98, Math.max(0.0, zeta)));
        return joint;
    }

    private double reducedMass(DistanceJoint<Body> joint, Map<String, Body> bodies) {
        double m1 = joint.getBody1().getMass().getMass();
        double m2 = joint.getBody2().getMass().getMass();
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
}
