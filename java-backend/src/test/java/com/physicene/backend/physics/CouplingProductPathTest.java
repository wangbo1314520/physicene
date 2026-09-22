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
import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.FullSnapshot;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.SubjectState;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 耦合产品路径测试（清偿令·测试真实性）：整链走 SimulationInstance.buildCouplingOrchestrator
 * → step() → dyn4j 力 → Frame.probes——与 P2.1 E2E 同一路径的 JVM 内版本。
 * 区别于 CouplingE2ETest（参考实现：测试体内手写 Euler 循环，不进产品代码）。
 */
class CouplingProductPathTest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        return new ElementRegistry(factories);
    }

    /** 导轨棒：F=2N 推 m=1 R=1 棒，B=1 L=1 → 终速 v=F·R/(B²L²)=2.00（电池内阻 0.001 → 2.002） */
    @Test
    void railRodTerminalVelocityProductPath() {
        PhysicsElement rail = new PhysicsElement();
        rail.setId("rail1"); rail.setType("wall"); rail.setPosition(new Vector2D(0, -0.5));
        rail.getProperties().setFriction(0.0);
        rail.getParams().put("railL", 1.0);
        PhysicsElement rod = new PhysicsElement();
        rod.setId("rod1"); rod.setType("cube"); rod.setPosition(new Vector2D(0, 0.5));
        rod.getProperties().setMass(1.0); rod.getProperties().setFriction(0.0);
        rod.getParams().put("_srcType", 1.0); rod.getParams().put("R", 1.0); rod.getParams().put("F", 2.0);
        PhysicsElement b = new PhysicsElement();
        b.setId("bf1"); b.setType("b_field"); b.setPosition(new Vector2D(0, 2));
        b.getProperties().setBField(1.0);

        Scene sc = new Scene();
        sc.setElements(List.of(rail, rod, b));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(6.0); cfg.setSubsteps(2); sc.setConfig(cfg);

        SimulationInstance in = new SimulationInstance("t-cp-rod", sc, registry());
        double[] lastVx = {0};
        double[] lastI = {0};
        in.addFrameListener(f -> {
            SubjectState s = ((FullSnapshot) f.getSnapshot()).getElements().stream()
                    .filter(e -> "rod1".equals(e.id())).findFirst().orElse(null);
            if (s != null) lastVx[0] = s.vx();
            if (f.getProbes() != null && f.getProbes().containsKey("I_R_rod1")) {
                lastI[0] = f.getProbes().get("I_R_rod1")[1];
            }
        });
        in.runToEndSync();
        assertTrue(Math.abs(lastVx[0] - 2.00) <= 0.01,
                "产品路径终速 v=" + lastVx[0] + "（理论 2.002 含电池内阻）");
        assertTrue(Math.abs(lastI[0] - 2.0) <= 0.04,
                "产品路径支路电流 I=" + lastI[0] + "（理论 B·L·v/R≈2A）");
    }

    /** 活塞气室：M=10 A=0.01 → 平衡 (p−p_atm)·A = Mg = 98N ±1%，读 Frame.probes（下发通道） */
    @Test
    void pistonGasEquilibriumProductPath() {
        PhysicsElement cyl = new PhysicsElement();
        cyl.setId("cyl1"); cyl.setType("wall"); cyl.setPosition(new Vector2D(0, 0));
        cyl.getParams().put("area", 0.01);
        PhysicsElement piston = new PhysicsElement();
        piston.setId("pis1"); piston.setType("cube"); piston.setPosition(new Vector2D(0, 1.2));
        piston.getProperties().setMass(10.0); piston.getProperties().setFriction(0.0);
        piston.getParams().put("_srcType", 2.0); piston.getParams().put("dampingRatio", 0.5);
        PhysicsElement gas = new PhysicsElement();
        gas.setId("gas1"); gas.setType("wall"); gas.setPosition(new Vector2D(0, -1));
        gas.getParams().put("_srcType", 3.0); gas.getParams().put("p0", 101325.0);
        gas.getParams().put("V0", 0.01); gas.getParams().put("T0", 300.0); gas.getParams().put("gamma", 1.0);

        Scene sc = new Scene();
        sc.setElements(List.of(cyl, piston, gas));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(6.0); cfg.setSubsteps(2); sc.setConfig(cfg);

        SimulationInstance in = new SimulationInstance("t-cp-pis", sc, registry());
        double[] lastVy = {0}, lastPA = {0}, lastMg = {0};
        in.addFrameListener((Frame f) -> {
            SubjectState s = ((FullSnapshot) f.getSnapshot()).getElements().stream()
                    .filter(e -> "pis1".equals(e.id())).findFirst().orElse(null);
            if (s != null) lastVy[0] = s.vy();
            if (f.getProbes() != null) {
                if (f.getProbes().containsKey("pA_pis1")) lastPA[0] = f.getProbes().get("pA_pis1")[1];
                if (f.getProbes().containsKey("Mg_pis1")) lastMg[0] = f.getProbes().get("Mg_pis1")[1];
            }
        });
        in.runToEndSync();
        assertTrue(lastMg[0] > 0, "probes 应含 Mg_pis1（耦合读数通道填充）");
        assertTrue(Math.abs(lastPA[0] - lastMg[0]) / lastMg[0] <= 0.01,
                "产品路径平衡 p·A=" + lastPA[0] + " vs Mg=" + lastMg[0] + "（±1%）");
        assertTrue(Math.abs(lastVy[0]) < 0.1, "活塞平衡静止 |vy|=" + lastVy[0]);
    }
}
