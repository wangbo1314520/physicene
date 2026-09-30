package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * P5b-1·双杆共轨单测（卡 40 回填）：杆1 恒力 F、杆2 无源，共享导轨（两轨两节点、各杆一支路）。
 * 教材规律（经典双杆稳态——首版测试理论漏了因子 2，实测 v1+v2=2.0000 驱动纠正）：
 * ① 动量定理任意时刻成立：m(v₁+v₂) = F·t（等质量；杆间安培力内力相消——拓扑自动给反向电流）
 * ② 稳态电流 I_ss = F/(2BL) = 0.25A（a₁=a₂ 时 F−BL·I = BL·I）
 * ③ 稳态速度差 Δv_ss = I_ss·ΣR/(BL) = F·ΣR/(2B²L²) = 0.5 m/s；τ≈0.7s → t=4s 已 ≥98% 趋稳
 * 参数：m=1+1、R=1+1、B=1、L=1、F=0.5N（4s 闭合距离 ~2m < 杆距 6m 不碰撞）
 */
class DoubleRodTest {
    private static final double F_EXT = 0.5, M = 1, R = 1, B = 1, L = 1;
    private static final double I_SS = F_EXT / (2 * B * L);
    private static final double DV_SS = I_SS * (R + R) / (B * L);

    private static PhysicsElement rail() {
        PhysicsElement w = new PhysicsElement();
        w.setId("rail"); w.setType("wall"); w.setPosition(new Vector2D(0, -0.5));
        w.setScale(new Vector2D(100.0, 0.2)); w.getProperties().setFriction(0.0); w.setFixed(true);
        Map<String, Double> rp = new HashMap<>(); rp.put("railL", L);
        w.setParams(rp);
        return w;
    }

    private static PhysicsElement rod(String id, double x, double fExt) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id); e.setType("cube"); e.setPosition(new Vector2D(x, 0));
        e.getProperties().setMass(M); e.getProperties().setFriction(0); e.getProperties().setRestitution(0);
        Map<String, Double> p = new HashMap<>();
        p.put("R", R); p.put("F", fExt); p.put("_srcType", 1.0);
        e.setParams(p);
        return e;
    }

    @Test void momentumAndSteadyState() {
        PhysicsElement field = new PhysicsElement();
        field.setId("bf"); field.setType("b_field"); field.setPosition(new Vector2D(3, 2));
        field.setScale(new Vector2D(24.0, 12.0)); field.setFixed(true);
        field.getProperties().setBField(B);

        Scene sc = new Scene();
        sc.setElements(List.of(rail(), field, rod("rod1", 0, F_EXT), rod("rod2", 6, 0)));
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(4); cfg.setSubsteps(4);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("dblrod-" + System.nanoTime(), sc,
            new ElementRegistry(List.of(new WallElementFactory(), new CubeElementFactory(), new BFieldFactory())));

        double[] v1 = {0}, v2 = {0}, tEnd = {0}, iRod1 = {0};
        in.addFrameListener(f -> {
            tEnd[0] = f.getT();
            if (f.getSnapshot() instanceof FullSnapshot snap && snap.getElements().size() >= 2) {
                v1[0] = snap.getElements().get(0).vx();
                v2[0] = snap.getElements().get(1).vx();
            }
            if (f.getProbes() != null) {
                double[] v = f.getProbes().get("I_R_rod1");
                if (v != null) iRod1[0] = v[1];
            }
        });
        in.runToEndSync();

        double pSum = F_EXT * tEnd[0] / M;                 // 等质量：m(v₁+v₂)=F·t → v₁+v₂=F·t/m
        System.out.printf("[dblrod] t=%.2f v1=%.4f v2=%.4f | 和=%.4f (theory %.4f) | Δv=%.4f (ss %.4f) | I=%.4f (ss %.4f)%n",
            tEnd[0], v1[0], v2[0], v1[0] + v2[0], pSum, v1[0] - v2[0], DV_SS, iRod1[0], I_SS);
        assertTrue(Math.abs((v1[0] + v2[0]) - pSum) / pSum < 0.01,
            String.format("动量定理 v1+v2=%.4f vs F·t/m=%.4f（应 <1%%——安培力内力相消）", v1[0] + v2[0], pSum));
        assertTrue(Math.abs((v1[0] - v2[0]) - DV_SS) / DV_SS < 0.05,
            String.format("稳态 Δv=%.4f vs F·ΣR/(2B²L²)=%.4f（应 <5%%，t=4s 已 ≥98%% 趋稳）", v1[0] - v2[0], DV_SS));
        assertTrue(Math.abs(iRod1[0] - I_SS) / I_SS < 0.05,
            String.format("稳态电流 I=%.4f vs F/(2BL)=%.4f（应 <5%%）", iRod1[0], I_SS));
    }
}
