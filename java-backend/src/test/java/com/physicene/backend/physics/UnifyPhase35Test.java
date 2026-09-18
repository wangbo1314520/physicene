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

    /**
     * 阶段四前置②（验收标准缺陷补闸）：fixed=true 的本体必须纹丝不动。
     * 背景：LabView「正负点电荷电场线」模板曾发 isFixed（被 Jackson 静默忽略），两电荷实际互相吸引运动，
     * 旧 E2E 只验动画未验物理量所以漏网——本用例在物理层锁死该语义（wire 键 fixed 经 JacksonBooleanNamingTest 锁定）。
     */
    @Test
    void fixedBodiesStayPut() {
        PhysicsElement qp = new PhysicsElement();
        qp.setId("qp");
        qp.setType("point_charge");
        qp.setPosition(new Vector2D(-3, 0));
        qp.setFixed(true);
        qp.setProperties(new PhysicalProperties());
        qp.getProperties().setMass(1);
        qp.getProperties().setCharge(2);
        qp.setInitialState(new InitialState());

        PhysicsElement qn = new PhysicsElement();
        qn.setId("qn");
        qn.setType("point_charge");
        qn.setPosition(new Vector2D(3, 0));
        qn.setFixed(true);
        qn.setProperties(new PhysicalProperties());
        qn.getProperties().setMass(1);
        qn.getProperties().setCharge(-2);
        qn.setInitialState(new InitialState());

        PhysicsElement wallTop = new PhysicsElement();
        wallTop.setId("w1");
        wallTop.setType("wall");
        wallTop.setPosition(new Vector2D(0, 5));
        wallTop.setFixed(true);

        Scene sc = new Scene();
        sc.setElements(List.of(qp, qn, wallTop));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(2.0);
        cfg.setGravity(new Vector2D(0, -9.8)); // 同时受重力和库仑吸引——固定体必须全部不动
        cfg.setSubsteps(4);
        sc.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("t-fixed", sc, registry());
        double[] maxMove = {0};
        instance.addFrameListener(f -> {
            FullSnapshot snap = (FullSnapshot) f.getSnapshot();
            for (var s : snap.getElements()) {
                if (s.id().startsWith("q")) {
                    double d = Math.hypot(s.x() - (s.id().equals("qp") ? -3 : 3), s.y());
                    maxMove[0] = Math.max(maxMove[0], d);
                }
            }
        });
        instance.runToEndSync();
        System.out.println("[fixed] 2s maxMove=" + maxMove[0]);
        assertTrue(maxMove[0] < 1e-9, "fixed=true 的点电荷在重力+库仑吸引下不得移动（实测位移 "
                + maxMove[0] + " m）——此为 LabView isFixed 被忽略 bug 的物理级闸门");
    }

    /** OPEN#2 隔离判定：单端固定弹簧阻尼是否生效（水平振子 ζ=0.8，3s 后振幅<5%） */
    @Test
    void singleEndSpringDampingDecays() {
        PhysicsElement spring = new PhysicsElement();
        spring.setId("sp");
        spring.setType("spring");
        spring.setPosition(new Vector2D(-2.9, 0.1));
        spring.getParams().put("jointLength", 1.2);
        spring.getParams().put("stiffness", 60.0);
        spring.getParams().put("dampingRatio", 0.8);
        PhysicsElement blk = new PhysicsElement();
        blk.setId("b1");
        blk.setType("cube");
        blk.setPosition(new Vector2D(-1.2, 0.1));
        blk.getProperties().setMass(1);
        blk.setInitialState(new InitialState());
        blk.getInitialState().setVelocity(new Vector2D(4, 0));
        spring.setConnectTo("b1");

        PhysicsElement gnd = new PhysicsElement();
        gnd.setId("g");
        gnd.setType("wall");
        gnd.setPosition(new Vector2D(0, -0.5));
        gnd.setScale(new Vector2D(20.0, 0.2));

        Scene sc = new Scene();
        sc.setElements(List.of(spring, gnd, blk));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(4.0);
        cfg.setGravity(new Vector2D(0, -9.8));
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        SimulationInstance instance = new SimulationInstance("t-spd", sc, registry());
        double[] x0 = {0};
        double[] maxAfter3 = {0};
        instance.addFrameListener(f -> {
            FullSnapshot snap = (FullSnapshot) f.getSnapshot();
            if (!snap.getElements().isEmpty()) {
                double x = snap.getElements().get(0).x();
                if (x0[0] == 0) x0[0] = x;
                if (f.getT() >= 3.0) maxAfter3[0] = Math.max(maxAfter3[0], Math.abs(x - (-1.2)));
            }
        });
        instance.runToEndSync();
        double a0 = Math.abs(x0[0] - (-1.2));
        System.out.println("[spd] a0=" + a0 + " maxAfter3=" + maxAfter3[0]);
        assertTrue(maxAfter3[0] < 0.05 * a0 + 1e-6,
                "ζ=0.8 单端弹簧 3s 后振幅应 <5%（a0=" + a0 + ", 3s后=" + maxAfter3[0] + "）");
    }
}