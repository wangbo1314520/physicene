package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;

class FrictionDiagnosticTest {
    private static ElementRegistry registry() {
        return new ElementRegistry(List.of(new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory()));
    }
    private static PhysicsElement el(String id, String type, double x, double y) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id); e.setType(type); e.setPosition(new Vector2D(x, y));
        return e;
    }
    /** 返回 [t, vx, x]——末帧 */
    private static double[] run(double groundMu, double blockMu, int substeps, double maxT) {
        PhysicsElement gnd = el("g", "wall", 0, -0.5);
        gnd.setScale(new Vector2D(50.0, 0.2)); gnd.getProperties().setFriction(groundMu); gnd.setFixed(true);
        PhysicsElement blk = el("b", "cube", 0, 0.1);
        blk.getProperties().setMass(1); blk.getProperties().setFriction(blockMu); blk.getProperties().setRestitution(0);
        blk.setInitialState(new InitialState());
        blk.getInitialState().setVelocity(new Vector2D(8, 0));
        Scene sc = new Scene(); sc.setElements(List.of(gnd, blk));
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(maxT); cfg.setSubsteps(substeps); sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("t-f", sc, registry());
        double[] last = {0, 8, 0};
        in.addFrameListener(f -> {
            FullSnapshot s = (FullSnapshot) f.getSnapshot();
            if (!s.getElements().isEmpty()) {
                last[0] = f.getT(); last[1] = s.getElements().get(0).vx(); last[2] = s.getElements().get(0).x();
            }
        });
        in.runToEndSync();
        return last;
    }

    @Test
    void frictionMatrix() {
        // 矩阵：ground_mu × block_mu × substeps → 有效 μ
        double[][] cases = {
            {0.2, 0.2, 2, 10}, {0.2, 0.2, 4, 10}, {0.2, 0.2, 8, 10},
            {0.2, 0.0, 4, 10}, {0.0, 0.2, 4, 10},
            {0.4, 0.4, 4, 10}, {1.0, 1.0, 4, 10},
            {0.2, 0.2, 4, 6},   // 与 E2E 同时长
        };
        System.out.println("══ 摩擦矩阵：v0=8, ground_mu, block_mu, substeps, maxT → v_end, x_end, a_eff, μ_eff ══");
        for (double[] c : cases) {
            double gm = c[0], bm = c[1]; int ss = (int) c[2]; double mt = c[3];
            double[] r = run(gm, bm, ss, mt);
            double dv = 8 - r[1];
            double aEff = dv / r[0];
            double muEff = aEff / 9.8;
            System.out.printf("g=%.1f b=%.1f ss=%d t=%.0f: v=%.3f x=%.2f a=%.3f μ_eff=%.4f (ratio to μ=%.2f)%n",
                gm, bm, ss, mt, r[1], r[2], aEff, muEff, gm > 0 ? muEff/gm : 0);
        }
    }
}
