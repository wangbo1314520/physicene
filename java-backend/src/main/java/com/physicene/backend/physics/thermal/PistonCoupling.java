package com.physicene.backend.physics.thermal;

import com.physicene.backend.physics.element.ElementContext;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.world.World;

/**
 * 活塞—气室耦合（阶段二 §3.5）：V = A·x_piston；F = (p − p_atm)·A 沿缸轴施加于活塞体。
 * 平衡条件：p·A = Mg（竖直）——MnaParityTest 后续耦合 E2E 断言 ±1%。
 */
public class PistonCoupling {
    private final GasCell cell;
    private final Body piston;
    private final double area;
    private final double x0;
    private final boolean vertical;

    public PistonCoupling(GasCell cell, Body piston, double area, double x0, boolean vertical) {
        this.cell = cell;
        this.piston = piston;
        this.area = area;
        this.x0 = x0;
        this.vertical = vertical;
    }

    /** 每子步：由活塞位置更新体积并施加气体力 */
    public void applyForce() {
        double pos = vertical ? piston.getTransform().getTranslationY() : piston.getTransform().getTranslationX();
        double volume = Math.max(1e-6, area * (pos - x0));
        cell.setVolume(volume);
        double f = cell.gaugePressure() * area;
        piston.applyForce(vertical
                ? new org.dyn4j.geometry.Vector2(0, f)
                : new org.dyn4j.geometry.Vector2(f, 0));
    }

    public GasCell getCell() { return cell; }
    public double getVolume() { return cell.getVolume(); }
    public double getPressure() { return cell.pressure(); }
}
