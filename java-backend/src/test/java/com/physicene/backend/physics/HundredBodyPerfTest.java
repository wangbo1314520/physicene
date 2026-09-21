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

/** 重审计 v2 项 4：100 元件性能断言（教学场景 ≤50 体的 2 倍压力档；50 体 175ms 基线已档） */
class HundredBodyPerfTest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        return new ElementRegistry(factories);
    }

    @Test
    void hundredBodiesThreeSecondsUnderBudget() {
        List<PhysicsElement> els = new ArrayList<>();
        PhysicsElement gnd = new PhysicsElement();
        gnd.setId("g"); gnd.setType("wall"); gnd.setPosition(new Vector2D(0, -20));
        gnd.setScale(new Vector2D(200, 0.2)); gnd.getProperties().setFriction(0.1);
        els.add(gnd);
        for (int i = 0; i < 100; i++) {   // 10×10 网格落体堆叠（重接触压力）
            PhysicsElement b = new PhysicsElement();
            b.setId("b" + i);
            b.setType("cube");
            b.setPosition(new Vector2D((i % 10) * 1.2 - 5.4, (i / 10) * 1.2 + 8));
            b.getProperties().setMass(1);
            b.getProperties().setFriction(0.1);
            els.add(b);
        }
        Scene sc = new Scene();
        sc.setElements(els);
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(3.0);
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        long t0 = System.currentTimeMillis();
        SimulationInstance in = new SimulationInstance("t-perf100", sc, registry());
        in.runToEndSync();
        long ms = System.currentTimeMillis() - t0;
        System.out.println("[perf100] 100 体 3s at-rest=OFF: " + ms + "ms");
        // 预算：50 体 175ms 的线性外推 ≈350ms；堆叠接触更重取 4 倍裕量 = 1400ms（教学上限 30s 的 4.6%）
        assertTrue(ms < 1400, "100 体 3s 应 <1400ms（实测 " + ms + "ms）");
    }
}
