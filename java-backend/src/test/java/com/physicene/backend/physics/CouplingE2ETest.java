package com.physicene.backend.physics;

import com.physicene.backend.physics.circuit.CircuitEngine;
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
import com.physicene.backend.physics.model.KeyEvent;
import com.physicene.backend.physics.model.PhysicalProperties;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.SubjectState;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 【参考实现测试——降级标记（清偿令·测试真实性审计）】
 * ①② 在测试体内手写 Euler 循环/自带阻尼，不走 CouplingOrchestrator/SimulationInstance——
 * 验证的是物理公式与 CircuitEngine/GasCell 单元，不覆盖产品接线（GS 力累积/阻尼链/probes
 * 三 bug 均在此盲区，见 P2.1 d1be6a3）。产品路径真测见 CouplingProductPathTest。
 * ③ 滑轮长窗口基线（技术债务 D1 的数据基线：5s 窗口振荡量化）——真测（SimulationInstance）。
 * 阶段二 DoD 耦合端到端（方案 §7 #8 抽样 + §3.5 DoD）。
 */
class CouplingE2ETest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        return new ElementRegistry(factories);
    }

    private static PhysicsElement el(String id, String type, double x, double y) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id);
        e.setType(type);
        e.setPosition(new Vector2D(x, y));
        return e;
    }

    // ===== ① 导轨棒耦合：恒力 F=2N 拉 m=1 棒在 B=1, L=1, R=1 上 → v_m = FR/(B²L²) = 2.00 =====
    @Test
    void railRodCouplingTerminalVelocity() {
        // 物理侧：光滑地面 + 恒力 F=2N 推 cube（模拟安培力方向）
        // 电路侧：EMF = B·L·v，R = 1Ω，I = EMF/(R+R_SRC)
        // 耦合循环：I → F_A = -B·L·I 施加于杆 → v 更新 → EMF 更新，收敛条件 F_A = F_ext
        double m = 1.0, b = 1.0, l = 1.0, r = 1.0, fExt = 2.0, dt = 1.0 / 240;
        double v = 0;
        CircuitEngine.Circuit circuit = new CircuitEngine.Circuit();
        var src = new CircuitEngine.Comp();
        src.id = "src_rod";
        src.kind = "battery";
        src.props.put("emf", 0.0);
        src.props.put("r", 0.001);
        var res = new CircuitEngine.Comp();
        res.id = "R_rod";
        res.kind = "resistor";
        res.props.put("R", r);
        circuit.components.add(src);
        circuit.components.add(res);
        circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_rod", 0), new CircuitEngine.PinRef("R_rod", 0)));
        circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_rod", 1), new CircuitEngine.PinRef("R_rod", 1)));
        CircuitEngine.EngineState st = CircuitEngine.EngineState.initial(circuit);

        double vTheoretical = fExt * r / (b * b * l * l); // = 2.00
        for (int k = 0; k < 240 * 5; k++) { // 5s
            double emf = b * l * v;
            src.props.put("emf", emf);
            var sol = CircuitEngine.solveDC(circuit, st);
            assertNotNull(sol);
            assertTrue(sol.ok);
            double i = sol.elements.get("R_rod").i();
            double fAmpere = -b * l * i;
            double a = (fExt + fAmpere) / m;
            v += a * dt;
        }
        double vWithSrc = fExt * r / (b * b * l * l) * r / (r + 0.001); // r_src=0.001 分压
        assertTrue(Math.abs(v - vWithSrc) < 0.015,
                "导轨棒耦合终速 v=" + v + " m/s，理论(含r_src)=" + vWithSrc);
    }

    // ===== ② 活塞—气室平衡：M=10kg 活塞在竖直汽缸中下沉至 p·A=Mg 平衡 =====
    @Test
    void pistonGasEquilibriumInCylinder() {
        double area = 0.01, m = 10, t = 300, p0 = 101325;
        double x0 = 2.0; // 缸底位置
        double v0 = area * 1.0; // 初始气柱高 1m → V=0.01 m³
        var cell = new com.physicene.backend.physics.thermal.GasCell(p0, v0, t, 1.0);
        double x = 1.0; // 活塞初始位置（气柱 1m）
        double vP = 0;
        double dt = 1.0 / 240;
        // 竖直方向：Ma = Mg − (p − p_atm)·A − c·v（活塞摩擦阻尼 c=2√(km)·0.5，近临界）；V = A·x
        double kGas = p0 * area * area / v0;
        double c = 2 * Math.sqrt(kGas * m) * 0.5;
        for (int k = 0; k < 240 * 5; k++) {
            cell.setVolume(area * x);
            double fGas = cell.gaugePressure() * area;
            double a = (m * 9.8 - fGas - c * vP) / m;
            vP += a * dt;
            x -= vP * dt; // x 向下减小
            if (x < 0.01) {
                x = 0.01;
            }
        }
        cell.setVolume(area * x);
        double balance = cell.gaugePressure() * area;
        assertTrue(Math.abs(balance - m * 9.8) / (m * 9.8) < 0.02,   // 第三十六轮 ±2% 收紧
                "活塞平衡 p·A=" + balance + " vs Mg=" + m * 9.8 + "（±5%，收敛至平衡±1%由 SceneValidator 校验静态参数域）");
    }

    // ===== ③ 滑轮长窗口基线（技术债务 D1 数据化）：阿特伍德 5s 窗口振荡量化 =====
    @Test
    void atwoodLongWindowBaseline() {
        PhysicsElement pulley = el("p1", "pulley", 0, 3);
        pulley.getParams().put("ratio", 1.0);
        pulley.getParams().put("pulley1dx", -0.6);
        pulley.getParams().put("pulley2dx", 0.6);
        pulley.setConnectTo("m1");
        pulley.setConnectTo2("m2");
        PhysicsElement m1 = new PhysicsElement();
        m1.setId("m1");
        m1.setType("cube");
        // 5s 窗口 m1 下落 ½at²=40.8m：初始两段绳各 45m（滑轮 y=3，质量 y=−42），
        // m2 上升 40.8m 后距滑轮仍有 4.2m——旧几何（y=2.2）t≈0.74s 时 m2 撞入滑轮锚点，
        // 系统冻结在势能比 E0 低 12.1% 的状态，才是旧基线 12.96% 的主体（场景伪影，非求解器漂移）
        m1.setPosition(new Vector2D(-0.6, -42));
        m1.setProperties(new PhysicalProperties());
        m1.getProperties().setMass(2);
        m1.setInitialState(new InitialState());
        PhysicsElement m2 = new PhysicsElement();
        m2.setId("m2");
        m2.setType("cube");
        m2.setPosition(new Vector2D(0.6, -42));
        m2.setProperties(new PhysicalProperties());
        m2.getProperties().setMass(1);
        m2.setInitialState(new InitialState());

        Scene sc = new Scene();
        sc.setElements(List.of(pulley, m1, m2));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(5.0);
        cfg.setSubsteps(4);
        sc.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("t-atwood-long", sc, registry());
        double[] maxDev = {0};
        double[] energy0 = {0};
        instance.addFrameListener(f -> {
            FullSnapshot snap = (FullSnapshot) f.getSnapshot();
            if (snap.getElements().size() >= 2) {
                SubjectState s1 = snap.getElements().get(0);
                SubjectState s2 = snap.getElements().get(1);
                double e = 0.5 * 2 * (s1.vx() * s1.vx() + s1.vy() * s1.vy())
                        + 0.5 * 1 * (s2.vx() * s2.vx() + s2.vy() * s2.vy())
                        + 2 * 9.8 * s1.y() + 1 * 9.8 * s2.y();
                if (energy0[0] == 0) {
                    energy0[0] = e;
                } else {
                    maxDev[0] = Math.max(maxDev[0], Math.abs(e - energy0[0]) / Math.abs(energy0[0]));
                }
            }
        });
        instance.runToEndSync();
        // 阶段三·五 D1：冲量式 + Baumgarte，5s 漂移 <2% 硬指标（罚力法基线 12.96%）
        System.out.println("[D1-impulse] 5s atwood maxEnergyDrift=" + String.format("%.4f%%", maxDev[0] * 100));
        assertTrue(maxDev[0] < 0.02,
                "阿特伍德 5s 能量漂移必须 <2%（实测 " + String.format("%.4f%%", maxDev[0] * 100)
                        + "；罚力法基线 12.96%）");
    }
}
