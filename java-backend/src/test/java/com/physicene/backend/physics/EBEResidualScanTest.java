package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * E-B-E 残速 substeps 扫描（第三十九轮——归因清单第②条：上一轮"检测在帧级"归因未验证被推翻，
 * 场力 isInside 已在子步级（applyCustomForces 在子步循环内）。新候选=磁场段子步洛伦兹旋转色散
 * → 出场速度差 → E2 段减速不对消 → 残速。判据：残速随 substeps 加倍而减小=数值色散（可改善）；
 * 不变=几何/其他。
 */
class EBEResidualScanTest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new PointChargeFactory(), new EFieldFactory(), new BFieldFactory());
        return new ElementRegistry(factories);
    }

    /** 复刻模板 gk-e-b-e-multi 几何（registry.ts L418-440 同参） */
    private static double residualAt(int substeps) {
        double v0 = 1, qm = 2, E1 = 2, B = 1;
        double v = Math.sqrt(v0 * v0 + 2 * qm * E1 * 6);
        double omega = qm * B, r = v / omega;
        double phi = Math.asin((-6 + r) / r);
        double exitX = 3 + r * Math.cos(phi);
        double vx0 = Math.sin(phi) * v, vy0 = -Math.cos(phi) * v;
        double a2 = v;
        double e2x = (-vx0 / v) * a2 / qm, e2y = (-vy0 / v) * a2 / qm;

        PhysicsElement e1 = new PhysicsElement();
        e1.setId("e1"); e1.setType("e_field"); e1.setPosition(new Vector2D(-6, 0));
        e1.setScale(new Vector2D(12, 6)); e1.setFixed(true);
        e1.getProperties().setEFieldX((double) E1); e1.getProperties().setEFieldY(0.0);
        PhysicsElement b = new PhysicsElement();
        b.setId("b"); b.setType("b_field"); b.setPosition(new Vector2D(9, 0));
        b.setScale(new Vector2D(12, 12)); b.setFixed(true);
        b.getProperties().setBField((double) B); b.getProperties().setBDirection("out");   // 模板 dir=1=⊙向外（目录选项 0=⊗in/1=⊙out）
        PhysicsElement e2r = new PhysicsElement();
        e2r.setId("e2"); e2r.setType("e_field"); e2r.setPosition(new Vector2D(-4, -13));
        e2r.setScale(new Vector2D(12, 6)); e2r.setFixed(true);
        e2r.getProperties().setEFieldX(e2x); e2r.getProperties().setEFieldY(e2y);
        PhysicsElement q = new PhysicsElement();
        q.setId("q"); q.setType("point_charge"); q.setPosition(new Vector2D(-6, 0));
        q.getProperties().setMass(1.0); q.getProperties().setCharge(qm);
        q.setInitialState(new com.physicene.backend.physics.model.InitialState());
        q.getInitialState().setVelocity(new Vector2D(v0, 0));

        Scene sc = new Scene();
        sc.setElements(List.of(e1, b, e2r, q));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(4.928);   // 模板 tTotal（registry 同式推导）——停后 E2 场会反向加速，窗口恰切
        cfg.setSubsteps(substeps);
        cfg.setGravity(new Vector2D(0, 0));   // 模板 gravityY=0
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("t-ebe-" + substeps, sc, registry());
        final double[] last = {0, 0, 0};
        in.addFrameListener(f -> {
            if (f.getSnapshot() instanceof com.physicene.backend.physics.model.FullSnapshot snap && !snap.getElements().isEmpty()) {
                var s = snap.getElements().get(0);
                last[0] = f.getT(); last[1] = s.vx(); last[2] = s.vy();
            }
        });
        in.runToEndSync();
        return Math.hypot(last[1], last[2]);
    }

    @Test
    void residualVsSubsteps() {
        double r4 = residualAt(4), r8 = residualAt(8), r16 = residualAt(16);
        System.out.printf("[ebe] substeps=4 残速=%.3f  8=%.3f  16=%.3f%n", r4, r8, r16);
        // 判据断言：随 substeps 减小 → 数值色散主导（可改善：提高 substeps 或换半隐式旋转）
        assertTrue(r8 < r4 * 0.9, "substeps 4→8 残速应显著下降（" + r4 + " → " + r8 + "）");
        // 8→16 为平台（0.112≈0.112，几何常数项）——断言不回升
        assertTrue(r16 <= r8 * 1.05, "8→16 平台不回升（" + r8 + " → " + r16 + "）");
    }
}
