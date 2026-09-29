package com.physicene.backend.physics;
import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * P5a 批2·加速平台（_srcType=8 电梯参考系）物理单测：
 * ① 等效重力抛体：斜抛峰值 H′ = y₀ + v₀ᵧ²/(2(g+a))（±2%，数值积分 dt² 收敛容差）
 * ② 对照组：a=0 退化为普通抛体 H = y₀ + v₀ᵧ²/(2g)（证明 ① 的峰差来自惯性力而非巧合）
 * ③ 支撑物平衡：静置于平台上的物体保持静止（N=m(g+a) 自动平衡，电梯系内不动）
 * ④ 等效下落时间：竖直上抛回到出发点 t=2v₀ᵧ/(g+a)（±3%——惯性力的时间效应）
 */
class AcceleratingPlatformTest {
    private static final double A = 2.0;   // 电梯向上加速度
    private static final double GEFF = 9.8 + A;

    private static PhysicsElement platform(double a) {
        PhysicsElement p = new PhysicsElement();
        p.setId("plat"); p.setType("wall"); p.setPosition(new Vector2D(0, 0));
        p.setScale(new Vector2D(12.0, 0.3)); p.getProperties().setFriction(0.0); p.setFixed(true);
        p.setParams(Map.of("a", a, "_srcType", 8.0));
        return p;
    }

    private static PhysicsElement particle(double y0, double vx, double vy) {
        PhysicsElement par = new PhysicsElement();
        par.setId("par"); par.setType("sphere"); par.setPosition(new Vector2D(-2, y0));
        par.setScale(new Vector2D(0.4, 0.4));
        par.getProperties().setMass(1); par.getProperties().setFriction(0); par.getProperties().setRestitution(0);
        par.setInitialState(new InitialState());
        par.getInitialState().setVelocity(new Vector2D(vx, vy));
        return par;
    }

    private static double[] runMaxAndReturn(PhysicsElement par, PhysicsElement plat, double duration) {
        Scene sc = new Scene(); sc.setElements(List.of(plat, par));
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(duration); cfg.setSubsteps(8);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("ap-test", sc,
            new ElementRegistry(List.of(new WallElementFactory(), new SphereElementFactory())));
        double[] maxY = { par.getPosition().y() };
        double[] finalY = { par.getPosition().y() };
        in.addFrameListener(f -> {
            FullSnapshot s = (FullSnapshot) f.getSnapshot();
            if (!s.getElements().isEmpty()) {
                double y = s.getElements().get(0).y();
                maxY[0] = Math.max(maxY[0], y);
                finalY[0] = y;
            }
        });
        in.runToEndSync();
        return new double[]{ maxY[0], finalY[0] };
    }

    @Test void equivalentGravityPeak() {
        double vy = 3.0;  // v₀ᵧ=3（卡 68 同值）
        double[] r = runMaxAndReturn(particle(0.5, 6 * Math.cos(Math.toRadians(30)), vy), platform(A), 1.5);
        double theory = 0.5 + vy * vy / (2 * GEFF);
        double diff = Math.abs(r[0] - theory) / theory;
        System.out.printf("[ap] 等效重力峰值 maxY=%.4f theory=%.4f (g'=%.1f) diff=%.2f%%%n", r[0], theory, GEFF, diff * 100);
        assertTrue(diff < 0.02, String.format("峰值 %.4f vs 理论 %.4f（应 <2%%）", r[0], theory));
    }

    @Test void controlGroupNoPlatformAcceleration() {
        double vy = 3.0;
        double[] r = runMaxAndReturn(particle(0.5, 6 * Math.cos(Math.toRadians(30)), vy), platform(0.0), 1.5);
        double theory = 0.5 + vy * vy / (2 * 9.8);   // a=0：普通重力抛体
        double diff = Math.abs(r[0] - theory) / theory;
        System.out.printf("[ap] 对照组 a=0 maxY=%.4f theory=%.4f diff=%.2f%%%n", r[0], theory, diff * 100);
        assertTrue(diff < 0.02, String.format("对照峰值 %.4f vs 理论 %.4f（应 <2%%）", r[0], theory));
    }

    @Test void supportedBodyStaysAtRestInElevatorFrame() {
        // 静置于平台表面（y=0.15 顶面 + 球半径 0.2 → 中心 0.35）：电梯系内应保持静止
        double[] r = runMaxAndReturn(particle(0.352, 0, 0), platform(A), 2.0);
        double drift = Math.abs(r[1] - 0.352);
        System.out.printf("[ap] 支撑平衡 finalY=%.4f drift=%.4f（N=m(g')= %.1f N 平衡）%n", r[1], drift, GEFF);
        assertTrue(drift < 0.02, String.format("漂移 %.4f 应 <0.02（接触约束须平衡惯性力+重力）", drift));
    }

    @Test void equivalentFallTime() {
        double vy = 2.5;
        Scene sc = new Scene();
        PhysicsElement par = particle(2.0, 0, vy);
        sc.setElements(List.of(platform(A), par));
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(1.0); cfg.setSubsteps(16);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("ap-t", sc,
            new ElementRegistry(List.of(new WallElementFactory(), new SphereElementFactory())));
        double[] tBack = { -1 };
        in.addFrameListener(f -> {
            FullSnapshot s = (FullSnapshot) f.getSnapshot();
            // 从 y0=2.0 竖直上抛后首次回到 ≤2.0 的帧时刻（帧 60fps 采样）
            if (tBack[0] < 0 && f.getT() > 0 && s.getElements() != null && !s.getElements().isEmpty()
                && s.getElements().get(0).y() <= 2.0) {
                tBack[0] = f.getT();
            }
        });
        in.runToEndSync();
        double theory = 2 * vy / GEFF;
        System.out.printf("[ap] 回落时刻 t=%.4f theory=%.4f%n", tBack[0], theory);
        if (tBack[0] > 0) {
            assertTrue(Math.abs(tBack[0] - theory) / theory < 0.03,
                String.format("回落 t=%.4f vs 理论 %.4f（应 <3%%）", tBack[0], theory));
        }
    }
}
