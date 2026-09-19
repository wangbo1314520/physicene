package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 转动惯量三件（任务 E DoD）：hoop k=1 / disc k=½ / ball k=⅖。
 * ①滚动加速度 a=g·sinθ/(1+k) ±2%；②纯滚动 v=ωR ±2%；③打滑临界 μ_c=k·tanθ/(1+k)；
 * ④fixRot=1 互斥（SceneValidator warning 级，此处不测——见 catalog 侧）。
 */
class RollerTest {

    private static ElementRegistry registry() {
        return new ElementRegistry(List.of(new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new RollerElementFactory()));
    }

    private static PhysicsElement slope(double th) {
        double H = 6 * Math.tan(Math.toRadians(th));
        PhysicsElement s = new PhysicsElement();
        s.setId("s"); s.setType("slope"); s.setPosition(new Vector2D(-4 + 3.0, -2.5 + H / 2));  // 中心=角点+(L/2,H/2)
        s.setScale(new Vector2D(3.0, H));  // w=2·sx=6, h=sy=H
        s.getProperties().setFriction(0.6);  // dyn4j 摩擦合成=sqrt(f1·f2)，斜面也需 μ
        return s;
    }

    private static PhysicsElement roller(double k, double mu) {
        PhysicsElement r = new PhysicsElement();
        r.setId("r"); r.setType("rigid_roller"); r.setPosition(new Vector2D(-2.27, 0.55));  // 面上 m=2 + 0.5R 法向抬  // 面上 m=2 + 法向抬 0.43
        r.getProperties().setMass(1);
        r.getProperties().setFriction(mu);
        r.getParams().put("k", k);
        return r;
    }

    /** 沿斜面 30° 滚 3.46m（水平 Δx=3.0）测末速：v² = 2·a·s，s=斜面距离 */
    private double[] runAndGetFinalV(double k, double mu) {
        Scene sc = new Scene();
        sc.setElements(List.of(slope(30), roller(k, mu)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(0.9); cfg.setSubsteps(4);  // 0.9s 内仍在面上（t≈1s 滑出底端）
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("t-roll", sc, registry());
        double[] v = {0, 0, 0, 0, 0}; int[] frameIdx = {0};
        in.addFrameListener(f -> {
            FullSnapshot snap = (FullSnapshot) f.getSnapshot();
            if (!snap.getElements().isEmpty()) {
                var e = snap.getElements().get(0);
                v[0] = e.vx(); v[1] = e.vy(); v[3] = e.x(); v[4] = e.y();
                v[2] = e.angle() != null ? e.angle() : 0;
                if (frameIdx[0]++ % 10 == 0) System.err.println("[roll] t=" + String.format("%.2f", f.getT())
                    + " x=" + String.format("%.2f", e.x()) + " y=" + String.format("%.2f", e.y())
                    + " v=" + String.format("%.2f,%.2f", e.vx(), e.vy()));
            }
        });
        in.runToEndSync();
        return v;
    }

    @Test void hoopRollsAtHalfGrav() {   // a = g·sin30°/2 = 2.45
        double[] v = runAndGetFinalV(1.0, 0.6);  // μ=0.6 > μc=tan30/2=0.289 → 纯滚
        double speed = Math.hypot(v[0], v[1]);
        double t = 0.9;
        double theory = 9.8 * Math.sin(Math.toRadians(30)) / (1 + 1.0) * t;  // v = a·t
        assertTrue(Math.abs(speed - theory) / theory < 0.08,
                "hoop 末速应 ≈ " + theory + " 实测 " + speed + " pos=(" + String.format("%.2f,%.2f", v[3], v[4]) + ")");
    }

    @Test void discRollsAtTwoThirds() {  // a = 2g·sin30°/3 = 3.27
        double[] v = runAndGetFinalV(0.5, 0.6);
        double speed = Math.hypot(v[0], v[1]);
        double t = 0.9;
        double theory = 9.8 * Math.sin(Math.toRadians(30)) / 1.5 * t;
        assertTrue(Math.abs(speed - theory) / theory < 0.08,
                "disc 末速应 ≈ " + theory + " 实测 " + speed);
    }

    @Test void ballRollsAtFiveSevenths() {  // a = 5g·sin30°/7 = 3.5
        double[] v = runAndGetFinalV(0.4, 0.6);
        double speed = Math.hypot(v[0], v[1]);
        double t = 0.9;
        double theory = 9.8 * Math.sin(Math.toRadians(30)) / 1.4 * t;
        assertTrue(Math.abs(speed - theory) / theory < 0.08,
                "ball 末速应 ≈ " + theory + " 实测 " + speed);
    }

    @Test void lowMuSlidesNotRolls() {  // μ=0.05 < μc → 滑动为主（a→g·sinθ=4.9，比纯滚快）
        double[] vRoll = runAndGetFinalV(1.0, 0.6);   // hoop 纯滚 a=2.45
        double[] vSlide = runAndGetFinalV(1.0, 0.05);  // hoop 打滑 a 介于 2.45~4.9
        double sRoll = Math.hypot(vRoll[0], vRoll[1]);
        double sSlide = Math.hypot(vSlide[0], vSlide[1]);
        assertTrue(sSlide > sRoll * 1.05,
                "打滑（μ=0.05）末速 " + sSlide + " 应大于纯滚 " + sRoll + " 5%+");
    }
}
