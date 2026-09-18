package com.physicene.backend.physics.thermal;

/**
 * 理想气体元胞（阶段二 §3.5）：pV = nRT；γ=5/3 绝热、1 等温（默认等温，教学口径）。
 * 供活塞耦合：V 由活塞位置反算，p 施加于活塞面。
 */
public class GasCell {
    private final double nMol;
    private double volume;
    private double temperature;
    private final double gamma;
    private final double pAtm = 101325.0;
    private double v0;

    public GasCell(double p0, double v0, double t0, double gamma) {
        this.nMol = p0 * v0 / (8.314 * t0);
        this.volume = v0;
        this.v0 = v0;
        this.temperature = t0;
        this.gamma = gamma;
    }

    public double pressure() {
        return nMol * 8.314 * temperature / volume;
    }

    public double gaugePressure() {
        return pressure() - pAtm;
    }

    /** 活塞位置变化 → 新体积；γ≠1 时温度按多方过程更新 */
    public void setVolume(double v) {
        double oldV = this.volume;
        this.volume = Math.max(1e-6, v);
        if (Math.abs(gamma - 1.0) > 1e-9) {
            this.temperature = this.temperature * Math.pow(oldV / this.volume, gamma - 1);
        }
    }

    public void setTemperature(double t) {
        this.temperature = t;
    }

    public double getVolume() { return volume; }
    public double getTemperature() { return temperature; }
    public double getN() { return nMol; }
    public double getGamma() { return gamma; }
    public double getV0() { return v0; }
    public double getpAtm() { return pAtm; }
}
