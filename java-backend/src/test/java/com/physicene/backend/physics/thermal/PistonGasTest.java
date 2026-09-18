package com.physicene.backend.physics.thermal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/** 阶段二 DoD #3：活塞—气室平衡 p·A = Mg ±1%（竖直汽缸，活塞质量 M，等温） */
class PistonGasTest {

    @Test
    void equilibriumPressureBalance() {
        double s = 0.01, m = 10, t = 300, p0 = 101325, v0 = 0.01;
        GasCell cell = new GasCell(p0, v0, t, 1.0);
        double n = cell.getN();
        double pEq = p0 + m * 9.8 / s;
        double vEq = n * 8.314 * t / pEq;
        cell.setVolume(vEq);
        assertTrue(Math.abs(cell.gaugePressure() * s - m * 9.8) / (m * 9.8) < 0.01,
                "p·A=Mg：got " + (cell.gaugePressure() * s) + " vs Mg=" + m * 9.8);
        assertTrue(Math.abs(cell.pressure() * vEq - n * 8.314 * t) / (n * 8.314 * t) < 0.01);
    }

    @Test
    void adiabaticGammaPath() {
        GasCell cell = new GasCell(101325, 1.0, 300, 5.0 / 3);
        cell.setVolume(0.5);
        double ratio = cell.getTemperature() / 300;
        assertTrue(Math.abs(ratio - Math.pow(2, 2.0 / 3)) < 0.01,
                "T2/T1=2^(γ-1)：got " + ratio);
    }
}
