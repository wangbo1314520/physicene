package com.physicene.backend.physics;
import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
class ProjectileDtvTest {
    @Test void dtCompare() {
        for (int ss : new int[]{2, 4, 8, 16}) {
            PhysicsElement gnd = new PhysicsElement();
            gnd.setId("g"); gnd.setType("wall"); gnd.setPosition(new Vector2D(0, -0.5));
            gnd.setScale(new Vector2D(100.0, 0.2)); gnd.getProperties().setFriction(0.0); gnd.setFixed(true);
            PhysicsElement par = new PhysicsElement();
            par.setId("p"); par.setType("sphere"); par.setPosition(new Vector2D(0, 0.5));
            par.getProperties().setMass(1); par.getProperties().setFriction(0); par.getProperties().setRestitution(0);
            par.setInitialState(new InitialState());
            double th = Math.toRadians(30);
            par.getInitialState().setVelocity(new Vector2D(10*Math.cos(th), 10*Math.sin(th)));
            Scene sc = new Scene(); sc.setElements(List.of(gnd, par));
            SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(3); cfg.setSubsteps(ss); sc.setConfig(cfg);
            SimulationInstance in = new SimulationInstance("t-dt"+ss, sc,
                new ElementRegistry(List.of(new WallElementFactory(), new SphereElementFactory())));
            double[] maxY = {0.5};
            in.addFrameListener(f -> {
                FullSnapshot s = (FullSnapshot) f.getSnapshot();
                if (!s.getElements().isEmpty()) maxY[0] = Math.max(maxY[0], s.getElements().get(0).y());
            });
            in.runToEndSync();
            double theory = 0.5 + (100 * Math.pow(Math.sin(th), 2)) / (2 * 9.8);
            System.out.printf("[dt] ss=%d dt=1/%d: maxY=%.4f theory=%.4f diff=%.2f%%%n",
                ss, 60*ss, maxY[0], theory, Math.abs(maxY[0]-theory)/theory*100);
        }
    }
}
