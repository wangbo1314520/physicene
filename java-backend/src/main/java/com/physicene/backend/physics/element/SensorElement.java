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
                // 修正 v5：返回矢量 (ax, ay) 而非标量模——消费者可投影到所需方向
                // 矢量模含法向接触振荡（物理限制），沿面分量才是滑块加速度
                return new double[]{t, lastAx, lastAy};
            }
            default:
                return null;
        }
    }

    public Body getTarget() { return target; }

    /** 修正版加速度：多帧窗口差分（5 帧平滑，消除接触脉冲噪声） */
    public void sampleAccel(double t, double dt) {
        if (target == null) return;
        double vx = target.getLinearVelocity().x;
        double vy = target.getLinearVelocity().y;
        velHistory.add(new double[]{t, vx, vy});
        if (velHistory.size() > 30) velHistory.removeFirst();  // 保留 30 帧（0.5s 平滑窗口）
        if (velHistory.size() >= 2) {
            double[] old = velHistory.getFirst();
            double[] now = velHistory.getLast();
            double window = now[0] - old[0];
            if (window > 1e-6) {
                lastAx = (now[1] - old[1]) / window;
                lastAy = (now[2] - old[2]) / window;
            }
        }
    }

    private final java.util.ArrayDeque<double[]> velHistory = new java.util.ArrayDeque<>();
    private double lastAx = 0, lastAy = 0;

    public double getLastAx() { return lastAx; }
    public double getLastAy() { return lastAy; }
}
