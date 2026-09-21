package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;

import java.util.ArrayList;
import java.util.List;

/** 百体场景单次运行（PerfStatisticsTest 五次均值复用） */
final class PerfRunner {
    private PerfRunner() {}

    static long runOnce(int substeps) {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        List<PhysicsElement> els = new ArrayList<>();
        PhysicsElement gnd = new PhysicsElement();
        gnd.setId("g"); gnd.setType("wall"); gnd.setPosition(new Vector2D(0, -20));
        gnd.setScale(new Vector2D(200, 0.2)); gnd.getProperties().setFriction(0.1);
        els.add(gnd);
        for (int i = 0; i < 100; i++) {
            PhysicsElement b = new PhysicsElement();
            b.setId("b" + i); b.setType("cube");
            b.setPosition(new Vector2D((i % 10) * 1.2 - 5.4, (i / 10) * 1.2 + 8));
            b.getProperties().setMass(1); b.getProperties().setFriction(0.1);
            els.add(b);
        }
        Scene sc = new Scene();
        sc.setElements(els);
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(3.0);
        cfg.setSubsteps(substeps);
        sc.setConfig(cfg);
        long t0 = System.currentTimeMillis();
        new SimulationInstance("t-perfstat", sc, new ElementRegistry(factories)).runToEndSync();
        return System.currentTimeMillis() - t0;
    }
}
