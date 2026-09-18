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
import com.physicene.backend.physics.model.InitialState;
import com.physicene.backend.physics.model.PhysicalProperties;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 阶段三·五 DoD 验证（D1：滑轮/绳冲量式约束 + Baumgarte β=0.2 γ=0.1）：
 * ① 阿特伍德 5s 能量漂移 <2%（CouplingE2ETest#atwoodLongWindowBaseline，实测 0.0272%）
 * ② 动滑轮 |v_A/v_B|≈2 ±2%（UnifyPhase1Test 既有用例回归）
 * ③ 绳摆小角周期 T=2π√(L/g) ±1%（本类）
 * ④ 弹簧振子周期 ±1%（UnifyPhase1Test 既有用例回归：冲量式与胡克力对共存）
 */
class UnifyPhase35Test {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        return new ElementRegistry(factories);
    }

    /**
     * ③ 绳摆小角周期：L=1m、θ₀=5°、m=1kg，理论 T=2π√(L/g)=2.0071s（5° 修正 +0.04%，忽略）。
     * 以 x(t) 同向过零间隔测周期（线性插值），取第 2 个周期起逐个断言 ±1%。
     */
    @Test
    void ropePendulumSmallAnglePeriod() {
        double theta0 = Math.toRadians(5);
        PhysicsElement rope = new PhysicsElement();
        rope.setId("r1");
        rope.setType("rope");
        rope.setPosition(new Vector2D(0, 3));
        rope.getParams().put("jointLength", 1.0);
        rope.setConnectTo("ball");

        PhysicsElement ball = new PhysicsElement();
        ball.setId("ball");
        ball.setType("sphere");
        ball.setPosition(new Vector2D(Math.sin(theta0), 3 - Math.cos(theta0)));
        ball.setProperties(new PhysicalProperties());
        ball.getProperties().setMass(1);
        ball.setInitialState(new InitialState());

        Scene sc = new Scene();
        sc.setElements(List.of(rope, ball));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(9.0); // ≈4.5 个周期
        cfg.setSubsteps(4);
        sc.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("t-pend", sc, registry());
        List<double[]> xt = new ArrayList<>(); // {t, x}
        instance.addFrameListener(f -> {
            FullSnapshot snap = (FullSnapshot) f.getSnapshot();
            if (!snap.getElements().isEmpty()) {
                xt.add(new double[]{f.getT(), snap.getElements().get(0).x()});
            }
        });
        instance.runToEndSync();

        // 同向（负→正）过零时刻，线性插值
        List<Double> crossings = new ArrayList<>();
        for (int i = 1; i < xt.size(); i++) {
            double x0 = xt.get(i - 1)[1], x1 = xt.get(i)[1];
            if (x0 < 0 && x1 >= 0) {
                double t0 = xt.get(i - 1)[0], t1 = xt.get(i)[0];
                crossings.add(t0 + (t1 - t0) * (-x0) / (x1 - x0));
            }
        }
        assertTrue(crossings.size() >= 3, "过零点不足（" + crossings.size() + "），无法测周期");
        double theory = 2 * Math.PI * Math.sqrt(1.0 / 9.8);
        double worst = 0;
        for (int i = 1; i < crossings.size(); i++) {
            double period = crossings.get(i) - crossings.get(i - 1);
            worst = Math.max(worst, Math.abs(period - theory) / theory);
        }
        System.out.println("[pend] T_theory=" + String.format("%.4f", theory)
                + " worstDev=" + String.format("%.4f%%", worst * 100)
                + " crossings=" + crossings.size());
        assertTrue(worst < 0.01, "绳摆小角周期偏差必须 <1%（实测最差 "
                + String.format("%.4f%%", worst * 100) + "，理论 T=" + theory + "s）");
    }
}
