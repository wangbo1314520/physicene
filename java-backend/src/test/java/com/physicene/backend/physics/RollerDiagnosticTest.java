package com.physicene.backend.physics;
import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
class RollerDiagnosticTest {
    @Test void rollerDiag() {
        for (double mu : new double[]{0.0, 0.1, 0.2, 0.3, 0.5}) {
            PhysicsElement gnd = new PhysicsElement();
            gnd.setId("g"); gnd.setType("wall"); gnd.setPosition(new Vector2D(0, -2));
            gnd.setScale(new Vector2D(100.0, 0.2)); gnd.getProperties().setFriction(0); gnd.setFixed(true);
            PhysicsElement slope = new PhysicsElement();
            slope.setId("s"); slope.setType("slope"); slope.setPosition(new Vector2D(0, 0));
            slope.setScale(new Vector2D(3.0, 3.0)); slope.getProperties().setFriction(mu);
            slope.setFixed(true);
            PhysicsElement roller = new PhysicsElement();
            roller.setId("r"); roller.setType("rigid_roller"); roller.setPosition(new Vector2D(2, 3));
            roller.getProperties().setMass(1); roller.getProperties().setFriction(mu);
            roller.getParams().put("k", 0.5);
            Scene sc = new Scene(); sc.setElements(List.of(gnd, slope, roller));
            SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(5); cfg.setSubsteps(4); sc.setConfig(cfg);
            SimulationInstance in = new SimulationInstance("t-r"+mu, sc,
                new ElementRegistry(List.of(new WallElementFactory(), new SlopeElementFactory(), new RollerElementFactory())));
            double[] lastVx = {0};
            in.addFrameListener(f -> {
                FullSnapshot s = (FullSnapshot) f.getSnapshot();
                for (var el : s.getElements()) if ("r".equals(el.id())) lastVx[0] = el.vx();
            });
            in.runToEndSync();
            double h = 6 * Math.sin(Math.toRadians(30));
            double vTheory = Math.sqrt(2 * 9.8 * h / (1 + 0.5)) * Math.cos(Math.toRadians(30));
            double vSlide = Math.sqrt(2 * 9.8 * h) * Math.cos(Math.toRadians(30));
            System.out.printf("mu=%.1f: vx=%.3f (roll_theory=%.3f slide_theory=%.3f ratio_to_roll=%.3f ratio_to_slide=%.3f)%n",
                mu, lastVx[0], vTheory, vSlide, lastVx[0]/vTheory, lastVx[0]/vSlide);
        }
    }
}
