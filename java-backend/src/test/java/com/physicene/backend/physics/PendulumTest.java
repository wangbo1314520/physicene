package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * P5a 批2-3·单摆周期单测（卡 67 回填）：T=2π√(L/g)（sinθ≈θ 小量公式）。
 * 摆球 fixRot=1 + 绳锚于球顶：中心速度=锚点速度（刚性竖直偏移）、高度差恒定 →
 * 动力学恰为摆长=绳长的单摆（KE=½mL²θ̇²，PE=−mgL·cosθ+const）——非近似处理，是构型等价。
 * φ₀=10°（大量修正 +0.19%，并入 1% 容差）。断言：
 * ① L=1：halfPeriod 事件序列均值 = π√(1/9.8)=1.0036（±1%）
 * ② L=2：= π√(2/9.8)=1.4196（±1%）——摆长×2 周期×√2（对照）
 * ③ 序列稳定性：各事件相对均值散布 <1.5%（周期不漂移=守恒）
 */
class PendulumTest {
    private static ElementRegistry registry() {
        return new ElementRegistry(List.of(new SphereElementFactory(), new RopeElementFactory(),
            new WallElementFactory(), new CubeElementFactory()));
    }

    /** 悬点摆：pivot(0,y0)、绳长 L、球心 = 顶锚 + (0,−0.5)，φ₀ 起摆 */
    private static List<PhysicsElement> pendulum(String id, double y0, double L, double phiDeg) {
        PhysicsElement pivot = new PhysicsElement();
        pivot.setId(id + "-pivot"); pivot.setType("sphere");  // NO_BODY 语义在前端；测试直接用绳悬点模式（position）
        pivot.setPosition(new Vector2D(0, y0));
        pivot.setFixed(true);
        double phi = Math.toRadians(phiDeg);
        double topX = L * Math.sin(phi), topY = y0 - L * Math.cos(phi);
        PhysicsElement bob = new PhysicsElement();
        bob.setId(id + "-bob"); bob.setType("sphere"); bob.setPosition(new Vector2D(topX, topY - 0.5));
        bob.getProperties().setMass(1); bob.getProperties().setFriction(0); bob.getProperties().setRestitution(0);
        bob.getParams().put("fixRot", 1.0);
        PhysicsElement rope = new PhysicsElement();
        rope.setId(id); rope.setType("rope"); rope.setPosition(new Vector2D(0, y0));
        rope.setConnectTo(id + "-bob"); rope.setAnchorA(new Vector2D(0, 0.5));
        Map<String, Double> p = new HashMap<>();
        p.put("jointLength", L); p.put("tMax", 100.0);
        rope.setParams(p);
        return List.of(pivot, bob, rope);
    }

    private static List<Double> halfPeriods(String id, double L, double duration) {
        List<PhysicsElement> els = new ArrayList<>(pendulum(id, 5, L, 10));
        Scene sc = new Scene(); sc.setElements(els);
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(duration); cfg.setSubsteps(8);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("pend-" + id + System.nanoTime(), sc, registry());
        List<Double> hps = new ArrayList<>();
        in.addKeyEventListener(e -> {
            if (("pendulum_pass_" + id).equals(e.getType())) {
                Object hp = e.getPayload().get("halfPeriod");
                if (hp instanceof Number) hps.add(((Number) hp).doubleValue());
            }
        });
        in.runToEndSync();
        return hps;
    }

    @Test void periodFormula() {
        for (double[] case_ : new double[][]{{1, 6}, {2, 6}}) {
            double L = case_[0];
            List<Double> hps = halfPeriods("p" + (int) L, L, case_[1]);
            double theory = Math.PI * Math.sqrt(L / 9.8);
            assertTrue(!hps.isEmpty(), "L=" + L + " 无过零事件");
            double mean = hps.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            double spread = hps.stream().mapToDouble(h -> Math.abs(h - mean)).max().orElse(0) / mean;
            System.out.printf("[pend] L=%.0f events=%d meanHalf=%.4f theory=%.4f diff=%.2f%% spread=%.2f%%%n",
                L, hps.size(), mean, theory, Math.abs(mean - theory) / theory * 100, spread * 100);
            assertTrue(Math.abs(mean - theory) / theory < 0.01,
                String.format("L=%.0f halfPeriod=%.4f vs %.4f（应<1%%）", L, mean, theory));
            assertTrue(spread < 0.015, String.format("L=%.0f 周期漂移 %.2f%%（应守恒）", L, spread * 100));
        }
    }
}
