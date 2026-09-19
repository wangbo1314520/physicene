package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.dynamics.Body;
import org.dyn4j.world.World;

/**
 * 检测器三件（任务 E）：accel_sensor / speed_sensor / range_finder。
 * 采样指定刚体的加速度/速度/距离，通过 Frame.probes 通道上帧（30fps）。
 * 无刚体（纯采样），不参与碰撞。
 */
public class SensorElement implements ElementBehavior {

    private final PhysicsElement data;
    private Body target;

    public SensorElement(PhysicsElement data) {
        this.data = data;
    }

    @Override
    public String getType() {
        return data.getType();  // accel_sensor / speed_sensor / range_finder
    }

    @Override
    public String ownId() {
        return data.getId();
    }

    @Override
    public Body createBody(World<Body> world) {
        return null;  // 传感器无刚体
    }

    @Override
    public boolean hasCustomForce() {
        return false;
    }

    /** 绑定采样目标（第二遍，createJoint 阶段） */
    public void bindTarget(java.util.Map<String, Body> bodies) {
        target = bodies.get(data.getConnectTo());
    }

    /** 采样：返回 [t, value] 或 null（目标缺失/静止） */
    public double[] sample(double t) {
        if (target == null) return null;
        switch (data.getType()) {
            case "speed_sensor": {
                double v = target.getLinearVelocity().getMagnitude();
                return new double[]{t, v};
            }
            case "range_finder": {
                double dx = target.getTransform().getTranslationX() - data.getPosition().x();
                double dy = target.getTransform().getTranslationY() - data.getPosition().y();
                return new double[]{t, Math.hypot(dx, dy)};
            }
            case "accel_sensor": {
                // getForce() 在 world.step 后被清零（附带追问确认）——改读重力+外力
                // 重力 = m·g（由 body.getGravityScale × world.getGravity 计算）
                double m = target.getMass().getMass();
                if (m <= 0 || Double.isInfinite(m)) m = 1;
                // 当前累积力（applyCustomForces 施的外力）+ 重力
                double fx = target.getForce().x;
                double fy = target.getForce().y;
                // 重力（常驻）：dyn4j 内部施，step 前有效
                fy += m * (-9.8) * target.getGravityScale();  // 默认重力向下
                return new double[]{t, Math.hypot(fx, fy) / m};
            }
            default:
                return null;
        }
    }

    public Body getTarget() { return target; }
}
