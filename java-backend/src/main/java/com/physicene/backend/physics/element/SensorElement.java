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
                // 追问2 修正：最小二乘拟合斜率 → 加速度矢量 (ax, ay)
                return new double[]{t, lastAx, lastAy};
            }
            default:
                return null;
        }
    }

    public Body getTarget() { return target; }

    /** 追问1 修正：接收本帧累积的接触力（SimulationInstance.postSolve 填充） */
    public void setContactForce(double fx, double fy) {
        contactFx = fx; contactFy = fy;
    }

    private double contactFx = 0, contactFy = 0;

    /** 追问2 修正：最小二乘拟合 v(t)=a·t+b，斜率 a 即加速度（比两点差分稳健 N 倍） */
    public void sampleAccel(double t, double dt) {
        if (target == null) return;
        double vx = target.getLinearVelocity().x;
        double vy = target.getLinearVelocity().y;
        velHistory.add(new double[]{t, vx, vy});
        if (velHistory.size() > 30) velHistory.removeFirst();
        if (velHistory.size() >= 5) {
            // 最小二乘拟合：a = Σ(t-t̄)(v-v̄) / Σ(t-t̄)²
            double n = velHistory.size();
            double tBar = 0, vxBar = 0, vyBar = 0;
            for (double[] d : velHistory) { tBar += d[0]; vxBar += d[1]; vyBar += d[2]; }
            tBar /= n; vxBar /= n; vyBar /= n;
            double stt = 0, stvx = 0, stvy = 0;
            for (double[] d : velHistory) {
                double dt_ = d[0] - tBar;
                stt += dt_ * dt_;
                stvx += dt_ * (d[1] - vxBar);
                stvy += dt_ * (d[2] - vyBar);
            }
            if (stt > 1e-12) {
                lastAx = stvx / stt;
                lastAy = stvy / stt;
            }
        }
    }

    private final java.util.ArrayDeque<double[]> velHistory = new java.util.ArrayDeque<>();
    private double lastAx = 0, lastAy = 0;

    public double getLastAx() { return lastAx; }
    public double getLastAy() { return lastAy; }
}
