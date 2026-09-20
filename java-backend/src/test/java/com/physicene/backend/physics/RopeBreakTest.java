package com.physicene.backend.physics;

import com.physicene.backend.physics.element.BeltElementFactory;
import com.physicene.backend.physics.element.BFieldFactory;
import com.physicene.backend.physics.element.CubeElementFactory;
import com.physicene.backend.physics.element.EFieldFactory;
import com.physicene.backend.physics.element.ElementBehaviorFactory;
import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.element.LoopTrackElementFactory;
import com.physicene.backend.physics.element.PointChargeFactory;
import com.physicene.backend.physics.element.PulleyElementFactory;
import com.physicene.backend.physics.element.RodElementFactory;
import com.physicene.backend.physics.element.RopeElementFactory;
import com.physicene.backend.physics.element.SlopeElementFactory;
import com.physicene.backend.physics.element.SphereElementFactory;
import com.physicene.backend.physics.element.SpringElementFactory;
import com.physicene.backend.physics.element.WallElementFactory;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.FullSnapshot;
import com.physicene.backend.physics.model.KeyEvent;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * D5 断绳三态单测（第二十五轮，开工令 B 项）：
 * ① 对称双断（Tmax < mg/(2cosα)）→ 两绳同帧断 → 自由落体
 * ② 偏置单断（T_R ≤ Tmax < mg·cosα_R）→ 左断右保 → 绕右绳钟摆
 * ③ 偏置连锁（Tmax < mg·cosα_R）→ 左断瞬间右绳张力跳升超限 → 连锁断 → 自由落体
 *
 * 数值设计（m=2kg，mg=19.6N，锚=块顶 (0,0.5)，fixRot=1 锁转保单摆公式）：
 *  - ①对称：悬点 (±0.8,1.2)、块心 (0,−0.055)、L=1.1 → T=14.28N，Tmax=10 同帧双断
  *  - ②③偏置（块心 (−0.55,0.3)，锚 (−0.55,0.8)）：左陡绳 L1=0.4717（静态 T1=19.5N，
 *    首子步冲击尖峰实测 22.0N）、右平绳 L2=1.4079（静态 T2=10.8N，尖峰 12.2N）；
 *    断右后绕左摆（摆长 0.472、φ0=32°、摆动峰值张力 mg(3−2cosφ0)=25.6N）
 *    ②右 Tmax=8（尖峰 12.2>8 断）+ 左 Tmax=50（>尖峰 22.0 与摆峰 25.6 全程保）→ 钟摆
 *    ③右 Tmax=8 + 左 Tmax=23.8（初始尖峰 22.0<23.8 保；摆到低点 25.6>23.8 连锁断，t≈T/4）
 *    注：首子步冲击张力≈静态×1.13（静止绷紧释放的物理瞬态，实测标定）
 */
class RopeBreakTest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        return new ElementRegistry(factories);
    }

    private static PhysicsElement block(String id, double x, double y) {
        PhysicsElement b = new PhysicsElement();
        b.setId(id);
        b.setType("cube");
        b.setPosition(new Vector2D(x, y));
        b.getProperties().setMass(2);
        b.getProperties().setFriction(0);
        b.getProperties().setRestitution(0);
        b.getParams().put("fixRot", 1.0);  // 锁转：单摆公式成立（滑块理想化）
        return b;
    }

    /** 悬点模式绳：connectTo=块，anchorA=块顶局部锚，position=悬点 */
    private static PhysicsElement rope(String id, double sx, double sy, double len, double tmax) {
        PhysicsElement r = new PhysicsElement();
        r.setId(id);
        r.setType("rope");
        r.setPosition(new Vector2D(sx, sy));
        r.setConnectTo("blk");
        r.setAnchorA(new Vector2D(0, 0.5));
        Map<String, Double> p = new HashMap<>();
        p.put("jointLength", len);
        p.put("tMax", tmax);
        r.setParams(p);
        return r;
    }

    /** {t, x, y, vx, vy} 帧采集（FullSnapshot 第一主体=块） */
    private static List<double[]> capture(Scene sc) {
        SimulationInstance in = new SimulationInstance("t-ropebreak-" + System.nanoTime(), sc, registry());
        List<double[]> frames = new ArrayList<>();
        in.addFrameListener(f -> {
            if (f.getSnapshot() instanceof FullSnapshot snap && !snap.getElements().isEmpty()) {
                var s = snap.getElements().get(0);
                frames.add(new double[]{ f.getT(), s.x(), s.y(), s.vx(), s.vy() });
            }
        });
        in.runToEndSync();
        return frames;
    }

    private static List<KeyEvent> breaks(Scene sc) {
        SimulationInstance in = new SimulationInstance("t-ropebreak2-" + System.nanoTime(), sc, registry());
        in.runToEndSync();
        return in.getKeyEvents().stream().filter(e -> e.getType().startsWith("rope_break:")).toList();
    }

    /** 末 0.3s 速度差分加速度 ay */
    private static double tailAy(List<double[]> fr) {
        int n = fr.size();
        var a = fr.get(n - 1);
        var b = fr.get(Math.max(0, n - 19));
        return (a[4] - b[4]) / Math.max(a[0] - b[0], 1e-6);
    }

    @Test
    void symmetricDoubleBreakFreeFall() {
        Scene sc = new Scene();
        sc.setElements(List.of(block("blk", 0, -0.055),
                rope("r1", -0.8, 1.2, 1.1, 10), rope("r2", 0.8, 1.2, 1.1, 10)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(1.5);
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        List<KeyEvent> breaks = breaks(sc);
        assertEquals(2, breaks.size(), "对称场景两绳应断（T=14.28 > Tmax=10），实测 " + breaks.size());
        assertEquals(breaks.get(0).getT(), breaks.get(1).getT(), 1e-9, "对称两绳同帧断");

        List<double[]> fr = capture(sc);
        double ay = tailAy(fr);
        assertTrue(Math.abs(ay + 9.8) < 1.0, "断后自由落体 a_y≈−9.8（实测 " + String.format("%.2f", ay) + "）");
        assertTrue(Math.abs(fr.get(fr.size() - 1)[1]) < 0.05, "对称断后水平不动");
    }

    @Test
    void biasedSingleBreakPendulum() {
        Scene sc = new Scene();
        // 右 Tmax=8：平绳 T2≈10.8（首子步尖峰 12.2>8）断；左 Tmax=50：初始尖峰 22.0 与摆峰 25.6 全程保
        sc.setElements(List.of(block("blk", -0.55, 0.3),
                rope("r1", -0.8, 1.2, 0.4717, 50), rope("r2", 0.8, 1.2, 1.4079, 8)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(5.0);   // ≈3.5 个摆周期
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        List<KeyEvent> breaks = breaks(sc);
        assertEquals(1, breaks.size(), "偏置·单断：只右（平）绳断（实测 " + breaks.size() + "）");

        List<double[]> fr = capture(sc);
        // 钟摆：块顶锚到左悬点距离恒 =0.403（绳保持绷紧不伸长）
        double maxDrift = 0;
        for (double[] f : fr) {
            double ax = f[1], ay = f[2] + 0.5;   // 锚=块心+(0,0.5)
            maxDrift = Math.max(maxDrift, Math.abs(Math.hypot(ax + 0.8, ay - 1.2) - 0.4717));
        }
        assertTrue(maxDrift < 0.02, "摆动半径恒为 0.4717（最大漂移 " + String.format("%.4f", maxDrift) + "）");
        // 周期：x 同向过零（φ0=29.7°，修正 T≈2π√(L/g)(1+φ0²/16)=1.295s）
        List<Double> zc = new ArrayList<>();
        for (int i = 1; i < fr.size(); i++) {
            double x0 = fr.get(i - 1)[1] + 0.8, x1 = fr.get(i)[1] + 0.8;
            if (x0 < 0 && x1 >= 0 && fr.get(i)[3] > 0.01) {
                double t0 = fr.get(i - 1)[0], t1 = fr.get(i)[0];
                zc.add(t0 + (t1 - t0) * (-x0) / Math.max(x1 - x0, 1e-9));
            }
        }
        assertTrue(zc.size() >= 2, "过零点不足（" + zc.size() + "）");
        double period = (zc.get(zc.size() - 1) - zc.get(0)) / (zc.size() - 1);
        double phi0 = Math.toRadians(32);
        double theory = 2 * Math.PI * Math.sqrt(0.4717 / 9.8) * (1 + phi0 * phi0 / 16);
        assertTrue(Math.abs(period - theory) / theory < 0.06,
                "钟摆周期 ≈ " + String.format("%.3f", theory) + "s ±6%（实测 " + String.format("%.3f", period) + "s）");
    }

    @Test
    void biasedChainBreakFreeFall() {
        Scene sc = new Scene();
        // 右 Tmax=8 断右；左 Tmax=23.8：初始尖峰 22.0<23.8 保，摆到低点峰值 25.6>23.8 → 连锁断
        sc.setElements(List.of(block("blk", -0.55, 0.3),
                rope("r1", -0.8, 1.2, 0.4717, 23.8), rope("r2", 0.8, 1.2, 1.4079, 8)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(1.5);
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        List<KeyEvent> breaks = breaks(sc);
        assertEquals(2, breaks.size(), "连锁断：两绳都断（实测 " + breaks.size() + "）");
        assertTrue(breaks.get(1).getT() - breaks.get(0).getT() > 0.05,
                "连锁有时序：右先断、摆至低点左后断（Δt=" + (breaks.get(1).getT() - breaks.get(0).getT()) + "s）");

        List<double[]> fr = capture(sc);
        double ay = tailAy(fr);
        assertTrue(Math.abs(ay + 9.8) < 1.2, "连锁断后自由落体 a_y≈−9.8（实测 " + String.format("%.2f", ay) + "）");
    }
}
