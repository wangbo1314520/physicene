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
 * P5a 批2-2·晾衣杆静力学单测（卡 23 回填）：横梁双绳悬挂 + 中点绳挂重。
 * 教材规律（三力交汇/对称）：侧绳 T_side = (M+m)g/(2sinθ)，sinθ = h/√(d²+h²)；
 * 中点绳 T_w = mg。几何：悬点 (±1.5,4.5)、梁 (0,2.5) 锚 (±0.5,2.5)、重物 (0,1.0) 顶 (0,1.5)。
 * ① T_side = 29.4·√5/4 = 16.43 N（±3%）  ② T_w = 19.6 N（±3%）
 * ③ 平衡稳定：重物 vy 尾段≈0、梁无水平漂移
 */
class ClotheslineTest {
    private static final double M_BEAM = 1, M_W = 2;
    private static final double T_SIDE = (M_BEAM + M_W) * 9.8 * Math.sqrt(5) / 4;
    private static final double T_W = M_W * 9.8;

    private static ElementRegistry registry() {
        return new ElementRegistry(List.of(new CubeElementFactory(), new SphereElementFactory(),
            new RopeElementFactory(), new WallElementFactory()));
    }

    private static PhysicsElement beam() {
        PhysicsElement b = new PhysicsElement();
        b.setId("beam"); b.setType("cube"); b.setPosition(new Vector2D(0, 2.5));
        b.getProperties().setMass(M_BEAM); b.getProperties().setFriction(0); b.getProperties().setRestitution(0);
        return b;  // 不锁转：对称构型梁保持水平（诚实物理）
    }

    private static PhysicsElement weight() {
        PhysicsElement w = new PhysicsElement();
        w.setId("weight"); w.setType("sphere"); w.setPosition(new Vector2D(0, 1.0));
        w.getProperties().setMass(M_W); w.getProperties().setFriction(0); w.getProperties().setRestitution(0);
        return w;
    }

    /** 悬点模式侧绳：position=悬点，connectTo=梁，anchorA=梁端局部锚 */
    private static PhysicsElement sideRope(String id, double sx, double ax) {
        PhysicsElement r = new PhysicsElement();
        r.setId(id); r.setType("rope"); r.setPosition(new Vector2D(sx, 4.5));
        r.setConnectTo("beam"); r.setAnchorA(new Vector2D(ax, 0));
        Map<String, Double> p = new HashMap<>();
        p.put("jointLength", Math.sqrt(5)); p.put("tMax", 100.0);
        r.setParams(p);
        return r;
    }

    /** 双端连体中点绳：梁底 (0,−0.5) ↔ 重物顶 (0,0.5)，L=0.5 */
    private static PhysicsElement midRope() {
        PhysicsElement r = new PhysicsElement();
        r.setId("rope-W"); r.setType("rope"); r.setPosition(new Vector2D(0, 2.0));
        r.setConnectTo("beam"); r.setAnchorA(new Vector2D(0, -0.5));
        r.setConnectTo2("weight"); r.setAnchorB(new Vector2D(0, 0.5));
        Map<String, Double> p = new HashMap<>();
        p.put("jointLength", 0.5); p.put("tMax", 100.0);
        r.setParams(p);
        return r;
    }

    @Test void symmetricStatics() {
        Scene sc = new Scene();
        sc.setElements(List.of(sideRope("rope-L", -1.5, -0.5), sideRope("rope-R", 1.5, 0.5),
            beam(), weight(), midRope()));
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(3); cfg.setSubsteps(8);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("clothesline-" + System.nanoTime(), sc, registry());

        double[] tL = {0}, tR = {0}, tW = {0}, weightVy = {0}, beamX = {0};
        int[] n = {0};
        in.addFrameListener(f -> {
            if (f.getProbes() != null) {
                double[] v;
                if ((v = f.getProbes().get("Tavg_rope-L")) != null) tL[0] = v[1];
                if ((v = f.getProbes().get("Tavg_rope-R")) != null) tR[0] = v[1];
                if ((v = f.getProbes().get("Tavg_rope-W")) != null) tW[0] = v[1];
            }
            if (f.getSnapshot() instanceof FullSnapshot snap && snap.getElements().size() >= 2) {
                beamX[0] = snap.getElements().get(0).x();
                weightVy[0] = snap.getElements().get(1).vy();
                if (n[0]++ % 20 == 0) {  // 诊断：轨迹采样
                    var w = snap.getElements().get(1);
                    System.out.printf("[traj] t=%.2f wY=%.4f wVy=%.4f Tavg_W=%.2f%n",
                        f.getT(), w.y(), w.vy(), tW[0]);
                }
            }
        });
        in.runToEndSync();

        System.out.printf("[clothesline] Tavg_L=%.3f Tavg_R=%.3f (theory %.3f) | Tavg_W=%.3f (theory %.3f) | beamX=%.4f wVy=%.4f%n",
            tL[0], tR[0], T_SIDE, tW[0], T_W, beamX[0], weightVy[0]);
        assertTrue(Math.abs(tL[0] - T_SIDE) / T_SIDE < 0.03, String.format("Tavg_L=%.3f vs %.3f", tL[0], T_SIDE));
        assertTrue(Math.abs(tR[0] - T_SIDE) / T_SIDE < 0.03, String.format("Tavg_R=%.3f vs %.3f", tR[0], T_SIDE));
        assertTrue(Math.abs(tW[0] - T_W) / T_W < 0.03, String.format("Tavg_W=%.3f vs %.3f", tW[0], T_W));
        assertTrue(Math.abs(weightVy[0]) < 0.05, "重物应静止（vy→0）");
        assertTrue(Math.abs(beamX[0]) < 0.02, "梁无水平漂移（对称构型）");
    }
}
