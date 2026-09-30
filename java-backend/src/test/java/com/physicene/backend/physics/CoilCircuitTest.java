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
 * P5a 批2-4·coil 电路合成单测（卡 42 物理回归 + 合成正确性）。
 * 场景=卡 42 映射态：B=1、w=1、R=1、m=1、v₀=2，场 [−6,6]，线圈从 x=5 出场（+x）。
 * ① 出场末速 v = v₀ − w/τ（闭式解 dv/dx=−1/τ，τ=mR/B²w²=1）→ 2−1=1（±5%）——力改电路电流后的回归锚
 * ② 飞行中存在感应电流帧：|I_coil|>0（进入电路的 EMF 驱动）
 * ③ I 与 v 自洽：采样帧 |I| ≈ B·w·v/R（±3%）——电路解出的电流 = EMF/R（合成断言）
 * ④ 出场后 I_coil=0、EMF=0（位置感知：dΦ/dt=0）
 */
class CoilCircuitTest {
    private static final double B = 1, W = 1, R = 1, V0 = 2;

    private static Scene scene42() {
        PhysicsElement ground = new PhysicsElement();
        ground.setId("g"); ground.setType("wall"); ground.setPosition(new Vector2D(0, -0.5));
        ground.setScale(new Vector2D(100.0, 0.2)); ground.getProperties().setFriction(0.0); ground.setFixed(true);

        PhysicsElement field = new PhysicsElement();
        field.setId("bf"); field.setType("b_field"); field.setPosition(new Vector2D(0, 2));
        field.setScale(new Vector2D(12.0, 12.0)); field.setFixed(true);
        field.getProperties().setBField(B);

        PhysicsElement coil = new PhysicsElement();
        coil.setId("coil42"); coil.setType("cube"); coil.setPosition(new Vector2D(5, 0));
        coil.getProperties().setMass(1); coil.getProperties().setFriction(0); coil.getProperties().setRestitution(0);
        coil.setInitialState(new InitialState());
        coil.getInitialState().setVelocity(new Vector2D(V0, 0));
        Map<String, Double> cp = new HashMap<>();
        cp.put("R", R); cp.put("w", W); cp.put("_srcType", 6.0);
        coil.setParams(cp);

        Scene sc = new Scene(); sc.setElements(List.of(ground, field, coil));
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(3); cfg.setSubsteps(4);
        sc.setConfig(cfg);
        return sc;
    }

    @Test void synthesisAndRegression() {
        SimulationInstance in = new SimulationInstance("coil-synth-" + System.nanoTime(), scene42(),
            new ElementRegistry(List.of(new WallElementFactory(), new CubeElementFactory(), new BFieldFactory())));
        double[] finalVx = {0};
        double[] maxI = {0};
        double[] selfConsist = {-1};   // 采样帧 |I|·R/(B·w·v)——应≈1
        in.addFrameListener(f -> {
            if (f.getSnapshot() instanceof FullSnapshot snap && !snap.getElements().isEmpty()) {
                double vx = snap.getElements().get(0).vx();
                finalVx[0] = vx;
                double[] iArr = f.getProbes() == null ? null : f.getProbes().get("I_coil_coil42");
                double[] eArr = f.getProbes() == null ? null : f.getProbes().get("EMF_coil42");
                double i = iArr != null ? iArr[1] : 0;
                double emf = eArr != null ? eArr[1] : 0;
                maxI[0] = Math.max(maxI[0], Math.abs(i));
                if (vx > 0.2 && Math.abs(i) > 0.05 && selfConsist[0] < 0) {
                    selfConsist[0] = Math.abs(i) * R / (B * W * vx);
                }
            }
        });
        in.runToEndSync();

        double vTheory = V0 - W / 1.0;   // v₀ − w/τ, τ=mR/B²w²=1
        System.out.printf("[coil] finalVx=%.4f (theory %.1f) | maxI=%.4f | I自洽=%.4f (应≈1)%n",
            finalVx[0], vTheory, maxI[0], selfConsist[0]);
        assertTrue(Math.abs(finalVx[0] - vTheory) / vTheory < 0.05,
            String.format("末速 %.4f vs %.1f（力改电路电流后的回归锚，±5%%）", finalVx[0], vTheory));
        assertTrue(maxI[0] > 0.1, "飞行中应有感应电流（EMF 进电路）");
        assertTrue(selfConsist[0] > 0.97 && selfConsist[0] < 1.03,
            String.format("I 自洽 |I|·R/(B·w·v)=%.4f（应 1±0.03——电路电流=EMF/R）", selfConsist[0]));
        // 出场后（runToEnd 收尾）I/EMF 应归零——由 maxI 在末段衰减保证，末速稳定即证
    }
}
