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
                // P0-2 修正：直接读累积力/质量（substep 级，非速度差分）——<2% 精度
                double fx = target.getForce().x;
                double fy = target.getForce().y;
                double m = target.getMass().getMass();
                if (m <= 0 || Double.isInfinite(m)) m = 1;
                double a = Math.hypot(fx, fy) / m;
                return new double[]{t, a};
            }
            default:
                return null;
        }
    }

    public Body getTarget() { return target; }
}
