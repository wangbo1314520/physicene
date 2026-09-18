package com.physicene.backend.physics.circuit;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 阶段二 DoD #1：MNA 对拍（方案 §7 #7）——同一组 20 个网表，
 * Java CircuitEngine 与 TS 版理论值（欧姆/基尔霍夫/戴维南/RC/RL/二极管）逐支路对比，差 < 1e-9。
 * 理论值手算自 TS 版公式（R_CONTACT=1e-3 等数值口径已含）。
 */
class MnaParityTest {

    private static CircuitEngine.Comp comp(String id, String kind, Object... kv) {
        CircuitEngine.Comp c = new CircuitEngine.Comp();
        c.id = id;
        c.kind = kind;
        for (int i = 0; i + 1 < kv.length; i += 2) {
            c.props.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return c;
    }

    private static void wire(CircuitEngine.Circuit c, String a, int pa, String b, int pb) {
        c.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef(a, pa), new CircuitEngine.PinRef(b, pb)));
    }

    private static final double EPS = 1e-9;

    private void assertClose(String what, double actual, double expected) {
        assertTrue(Math.abs(actual - expected) < EPS,
                what + ": Java=" + actual + " 理论=" + expected + " 差=" + Math.abs(actual - expected));
    }

    // 1 纯电阻分压
    @Test
    void t01VoltageDivider() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 6.0, "r", 0.0));
        c.components.add(comp("R1", "resistor", "R", 2000.0));
        c.components.add(comp("R2", "resistor", "R", 1000.0));
        wire(c, "B", 0, "R1", 0);
        wire(c, "R1", 1, "R2", 0);
        wire(c, "R2", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertTrue(s.ok);
        double r1 = CircuitEngine.R_CONTACT; // battery 内阻 0 → R_SRC_MIN=1e-3；R1 R=2000 >> 1e-3，总 I=6/(3000.001)
        double iExp = 6.0 / (2000.0 + 1000.0 + CircuitEngine.R_SRC_MIN);
        assertClose("I", s.elements.get("R1").i(), iExp);
        double v2 = s.elements.get("R2").v();
        assertTrue(Math.abs(v2 - iExp * 1000.0) < 5e-9, "V_R2: Java=" + v2);
    }

    // 2 电源内阻显著（戴维南）
    @Test
    void t02InternalResistance() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 3.0, "r", 1.0));
        c.components.add(comp("R", "resistor", "R", 5.0));
        wire(c, "B", 0, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("R").i(), 3.0 / 6.0);
        assertClose("U_term", s.elements.get("R").v(), 2.5);
    }

    // 3 并联
    @Test
    void t03Parallel() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 12.0, "r", 0.0));
        c.components.add(comp("R1", "resistor", "R", 4000.0));
        c.components.add(comp("R2", "resistor", "R", 6000.0));
        wire(c, "B", 0, "R1", 0);
        wire(c, "R1", 1, "B", 1);
        wire(c, "B", 0, "R2", 0);
        wire(c, "R2", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        double rp = 1.0 / (1.0 / 4000 + 1.0 / 6000); // 2400
        double iExp = 12.0 / (rp + CircuitEngine.R_SRC_MIN);
        assertClose("I_R1", s.elements.get("R1").i(), 12.0 / 4000.0 * (rp / (rp + CircuitEngine.R_SRC_MIN)));
        double i1 = s.elements.get("R1").i();
        double i2 = s.elements.get("R2").i();
        assertClose("KCL", i1 + i2, iExp);
    }

    // 4 开关断开
    @Test
    void t04SwitchOpen() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 5.0, "r", 0.5));
        c.components.add(comp("SW", "switch", "closed", false));
        c.components.add(comp("R", "resistor", "R", 100.0));
        wire(c, "B", 0, "SW", 0);
        wire(c, "SW", 1, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I=0", s.elements.get("R").i(), 0.0);
    }

    // 5 开关闭合
    @Test
    void t05SwitchClosed() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 5.0, "r", 0.5));
        c.components.add(comp("SW", "switch", "closed", true));
        c.components.add(comp("R", "resistor", "R", 100.0));
        wire(c, "B", 0, "SW", 0);
        wire(c, "SW", 1, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("R").i(), 5.0 / (0.5 + CircuitEngine.R_CONTACT + 100.0));
    }

    // 6 滑动变阻器中点
    @Test
    void t06RheostatMid() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 10.0, "r", 0.0));
        c.components.add(comp("RV", "rheostat", "Rmax", 100.0, "pos", 0.5));
        c.components.add(comp("R", "resistor", "R", 900.0));
        // B → RV.A；RV.C → R → B−；RV.B 悬空
        wire(c, "B", 0, "RV", 0);
        wire(c, "RV", 2, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        double rA = Math.max(CircuitEngine.R_CONTACT, 50.0); // A→C 段 = pos*Rmax
        double iExp = 10.0 / (rA + 900.0 + CircuitEngine.R_SRC_MIN);
        assertClose("I", s.elements.get("RV").i(), iExp);
    }

    // 7 电流表串联（内阻 0.125Ω @0.6A 挡）
    @Test
    void t07AmmeterSeries() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 1.5, "r", 0.1));
        c.components.add(comp("A", "ammeter", "rangeKey", "0.6A"));
        c.components.add(comp("R", "resistor", "R", 5.0));
        wire(c, "B", 0, "A", 0);
        wire(c, "A", 1, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("A").i(), 1.5 / (0.1 + 0.125 + 5.0 + CircuitEngine.R_SRC_MIN - CircuitEngine.R_SRC_MIN + 0.0));
    }

    // 8 电压表并联（3V 挡 3kΩ）
    @Test
    void t08VoltmeterParallel() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 3.0, "r", 0.1));
        c.components.add(comp("R1", "resistor", "R", 10.0));
        c.components.add(comp("R2", "resistor", "R", 10.0));
        c.components.add(comp("V", "voltmeter", "rangeKey", "3V"));
        wire(c, "B", 0, "R1", 0);
        wire(c, "R1", 1, "R2", 0);
        wire(c, "R2", 1, "B", 1);
        wire(c, "V", 0, "R2", 0);
        wire(c, "V", 1, "R2", 1);
        var s = CircuitEngine.solveDC(c);
        // R2 ∥ 3000
        double rp2 = 10.0 * 3000.0 / (10.0 + 3000.0);
        double iExp = 3.0 / (0.1 + 10.0 + rp2);
        assertClose("I_total(R1)", s.elements.get("R1").i(), iExp);
    }

    // 9 灵敏电流计（100Ω）
    @Test
    void t09Galvanometer() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "dc_source", "emf", 2.0, "r", 0.05));
        c.components.add(comp("G", "galvanometer", "rangeKey", "300μA"));
        c.components.add(comp("R", "resistor", "R", 1900.0));
        wire(c, "B", 0, "G", 0);
        wire(c, "G", 1, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("G").i(), 2.0 / (0.05 + 100.0 + 1900.0));
    }

    // 10 小灯泡线性模型
    @Test
    void t10Lamp() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 3.0, "r", 0.2));
        c.components.add(comp("L", "lamp", "ratedU", 2.5, "ratedI", 0.3));
        wire(c, "B", 0, "L", 0);
        wire(c, "L", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        double rLamp = 2.5 / 0.3; // ≈ 8.333
        assertClose("I", s.elements.get("L").i(), 3.0 / (0.2 + rLamp));
    }

    // 11 光敏电阻全暗
    @Test
    void t11PhotoDark() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 9.0, "r", 0.1));
        c.components.add(comp("P", "photoresistor", "rDark", 100000.0, "rLight", 500.0, "light", 0.0));
        wire(c, "B", 0, "P", 0);
        wire(c, "P", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("P").i(), 9.0 / (0.1 + 100000.0));
    }

    // 12 金属丝电阻 ρL/S
    @Test
    void t12WireSample() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 1.5, "r", 0.05));
        c.components.add(comp("W", "wire_sample", "rho", 1.1e-6, "L", 0.5, "d", 0.5));
        wire(c, "B", 0, "W", 0);
        wire(c, "W", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        double area = Math.PI * 0.5e-3 * 0.5e-3 / 4;
        double r = 1.1e-6 * 0.5 / area;
        assertClose("I", s.elements.get("W").i(), 1.5 / (0.05 + r));
    }

    // 13 二极管导通（vf=0.7）
    @Test
    void t13DiodeOn() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 3.0, "r", 0.1));
        c.components.add(comp("D", "diode", "vf", 0.7));
        c.components.add(comp("R", "resistor", "R", 100.0));
        wire(c, "B", 0, "D", 0);
        wire(c, "D", 1, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("R").i(), (3.0 - 0.7) / (0.1 + 0.5 + 100.0));
    }

    // 14 二极管反接截止
    @Test
    void t14DiodeOff() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 3.0, "r", 0.1));
        c.components.add(comp("D", "diode", "vf", 0.7));
        // 反接：battery + → diode pin1（负极）
        c.components.add(comp("R", "resistor", "R", 100.0));
        wire(c, "B", 0, "D", 1);
        wire(c, "D", 0, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        assertTrue(Math.abs(s.elements.get("R").i()) < 1e-6, "反接 I≈0, got " + s.elements.get("R").i());
    }

    // 15 感应线圈 EMF（coil emf=2V, rw=1Ω）
    @Test
    void t15CoilEmf() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("C", "coil", "emf", 2.0, "rw", 1.0));
        c.components.add(comp("R", "resistor", "R", 3.0));
        wire(c, "C", 0, "R", 0);
        wire(c, "R", 1, "C", 1);
        var s = CircuitEngine.solveDC(c);
        assertClose("I", s.elements.get("R").i(), 2.0 / 4.0);
    }

    // 16 RC 暂态第一步（h=0.001, C=1e-3）
    @Test
    void t16CapFirstStep() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 10.0, "r", 0.0));
        c.components.add(comp("R", "resistor", "R", 1000.0));
        c.components.add(comp("C", "capacitor", "C", 1e-3, "v0", 0.0));
        wire(c, "B", 0, "R", 0);
        wire(c, "R", 1, "C", 0);
        wire(c, "C", 1, "B", 1);
        var st = CircuitEngine.EngineState.initial(c);
        double h = 0.001;
        var s = CircuitEngine.transientStep(c, st, h, h);
        assertNotNull(s);
        // 第一步：R_C = h/C = 1Ω；I = 10/(1000+1+1e-3)
        double iExp = 10.0 / (1000.0 + h / 1e-3 + CircuitEngine.R_SRC_MIN);
        assertClose("I_step1", s.elements.get("R").i(), iExp);
    }

    // 17 RL 暂态第一步（h=0.001, L=1, rw=0）
    @Test
    void t17InductorFirstStep() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 10.0, "r", 0.0));
        c.components.add(comp("R", "resistor", "R", 1000.0));
        c.components.add(comp("L", "inductor", "L", 1.0, "rw", 0.0, "i0", 0.0));
        wire(c, "B", 0, "R", 0);
        wire(c, "R", 1, "L", 0);
        wire(c, "L", 1, "B", 1);
        var st = CircuitEngine.EngineState.initial(c);
        double h = 0.001;
        var s = CircuitEngine.transientStep(c, st, h, h);
        assertNotNull(s);
        double g = 1 / (Math.max(CircuitEngine.R_CONTACT, 0) + 1.0 / h);
        double iExp = g * 10.0 / (1 + g * 1000); // 近似；用严格数值
        // 直接手算：L/h = 1000Ω，总 R = 1000(R) + 1000(L') + 1e-3(src)，I = 10/2000.001
        double iStrict = 10.0 / (1000.0 + Math.max(CircuitEngine.R_CONTACT, 0.0) + 1.0 / h + CircuitEngine.R_SRC_MIN);
        assertClose("I_step1", s.elements.get("R").i(), iStrict);
        assertTrue(Math.abs(iExp - iStrict) < 1e-6);
    }

    // 18 多用电表电压挡（50kΩ @2.5V）
    @Test
    void t18MultimeterDCV() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 3.0, "r", 0.0));
        c.components.add(comp("R1", "resistor", "R", 10000.0));
        c.components.add(comp("R2", "resistor", "R", 10000.0));
        c.components.add(comp("M", "multimeter", "mode", "dcv", "rangeKey", "2.5V"));
        wire(c, "B", 0, "R1", 0);
        wire(c, "R1", 1, "R2", 0);
        wire(c, "R2", 1, "B", 1);
        wire(c, "M", 0, "R2", 0);
        wire(c, "M", 1, "R2", 1);
        var s = CircuitEngine.solveDC(c);
        // R2 ∥ 50000
        double rp2 = 10000.0 * 50000.0 / 60000.0;
        double iExp = 3.0 / (10000.0 + rp2 + CircuitEngine.R_SRC_MIN);
        assertClose("I", s.elements.get("R1").i(), iExp);
    }

    // 19 多用电表欧姆挡（中值 15Ω × 1 挡）
    @Test
    void t19MultimeterOhm() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("M", "multimeter", "mode", "ohm", "rangeKey", "×1"));
        c.components.add(comp("Rx", "resistor", "R", 15.0));
        wire(c, "M", 0, "Rx", 0);
        wire(c, "M", 1, "Rx", 1);
        var s = CircuitEngine.solveDC(c);
        // 欧姆挡内电池 1.5V + 中值 15Ω 串 Rx=15Ω → I = 1.5/30 = 0.05A；中值刻度正确
        double iExp = CircuitEngine.OHM_EMF / (15.0 + 15.0);
        assertClose("I_abs", Math.abs(s.elements.get("Rx").i()), iExp);
    }

    // 20 继电器线圈通电吸合（vOn=2.5）
    @Test
    void t20RelayPickup() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        c.components.add(comp("B", "battery", "emf", 6.0, "r", 0.1));
        c.components.add(comp("RL", "relay", "rCoil", 100.0, "vOn", 2.5, "normallyClosed", false));
        c.components.add(comp("R", "resistor", "R", 50.0));
        wire(c, "B", 0, "RL", 0);
        wire(c, "RL", 1, "B", 1);
        // 触点侧独立回路：battery+ → relay pin2 → pin3 → R → battery−（简化：同电池）
        wire(c, "B", 0, "RL", 2);
        wire(c, "RL", 3, "R", 0);
        wire(c, "R", 1, "B", 1);
        var s = CircuitEngine.solveDC(c);
        // 线圈 100Ω 与触点支路（R_CONTACT+50）并联后再串 0.1Ω 内阻；精确解用同式
        double rContact = 50.0 + CircuitEngine.R_CONTACT;
        double rPar = 100.0 * rContact / (100.0 + rContact);
        double vTop = 6.0 * 100.0 * rContact / ((100.0 + rContact) * (0.1 + rPar) + 0.0); // 近似——直接用数值
        // 精确：节点电压 V1 = 6 * rPar / (0.1 + rPar)；线圈电流 = V1 / 100
        double v1 = 6.0 * rPar / (0.1 + rPar);
        assertClose("I_coil", s.elements.get("RL").i(), v1 / 100.0);
        assertTrue(s.elements.get("R").i() > 0.01, "线圈 >25mA → 吸合，触点回路应通，got " + s.elements.get("R").i());
    }
}
