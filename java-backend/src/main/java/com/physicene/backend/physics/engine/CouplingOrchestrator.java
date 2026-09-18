package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.circuit.CircuitEngine;
import com.physicene.backend.physics.thermal.GasCell;
import com.physicene.backend.physics.thermal.PistonCoupling;
import org.dyn4j.dynamics.Body;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 耦合调度器（阶段二 §3.9）：按契约步驱动电路 ↔ 刚体 ↔ 热学强耦合。
 * 每契约步（1/60s，内部 substeps 子步）执行：
 * 1. circuitNet.setSourceEmf(由 rod 速度)  2. circuit.solve
 * 3. 力源汇合：场力 + 安培力 + 气体力 → applyForce  4. world.step(substep)
 * 强耦合（默认）：子步内高斯-赛德尔迭代 ≤8 次直到 max(Δi/i, Δv/v) < 1e-4；
 * 不收敛 → keyEvent "coupling_degraded" 并降级弱耦合继续（精度标 explicit-1/240）。
 */
public class CouplingOrchestrator {

    public record RodBarLink(String rodId, Body rodBody, String branchId, double b, double l) {
    }

    private final CircuitEngine.Circuit circuit;
    private final CircuitEngine.EngineState circuitState;
    private final Map<String, RodBarLink> rodLinks = new LinkedHashMap<>();
    private final Map<String, PistonCoupling> pistons = new LinkedHashMap<>();
    private double subDt;
    private int maxIter = 8;
    private double tol = 1e-4;
    private boolean degraded = false;

    public CouplingOrchestrator(CircuitEngine.Circuit circuit, double subDt) {
        this.circuit = circuit;
        this.circuitState = CircuitEngine.EngineState.initial(circuit);
        this.subDt = subDt;
    }

    public void addRodLink(RodBarLink link) {
        rodLinks.put(link.rodId(), link);
    }

    public void addPiston(PistonCoupling pc) {
        pistons.put(pc.getCell().hashCode() + "", pc);
    }

    /** 单子步耦合求解：返回 [电流表(各 rod 支路 I), 是否收敛] */
    public StepResult step(double t) {
        if (rodLinks.isEmpty() && pistons.isEmpty()) {
            CircuitEngine.DCSolution sol = CircuitEngine.solveDC(circuit, circuitState);
            return new StepResult(sol, true, 0);
        }
        double prevI = 0, prevV = 0;
        CircuitEngine.DCSolution sol = null;
        int iter;
        boolean converged = false;
        double finalI = 0, finalV = 0;
        for (iter = 0; iter < maxIter; iter++) {
            // 1. 由杆速度刷新 EMF = B·L·v
            for (var link : rodLinks.values()) {
                double v = link.rodBody().getLinearVelocity().x;
                double emf = link.b() * link.l() * v;
                var comp = circuit.components.stream().filter(c -> c.id.equals("src_" + link.rodId())).findFirst();
                comp.ifPresent(c -> c.props.put("emf", emf));
                if (comp.isEmpty()) {
                    var nc = new CircuitEngine.Comp();
                    nc.id = "src_" + link.rodId();
                    nc.kind = "battery";
                    nc.props.put("emf", emf);
                    nc.props.put("r", 0.001);
                    circuit.components.add(nc);
                }
            }
            // 2. 电路求解
            sol = CircuitEngine.solveDC(circuit, circuitState);
            if (sol == null || !sol.ok) {
                return new StepResult(null, false, iter);
            }
            // 3. 安培力 + 气体力 → 施加于刚体
            double iSum = 0, vSum = 0;
            for (var link : rodLinks.values()) {
                CircuitEngine.ElementResult er = sol.elements.get("R_" + link.rodId());
                double i = er != null ? er.i() : 0;
                iSum += i;
                double f = -link.b() * link.l() * i;
                link.rodBody().applyForce(new org.dyn4j.geometry.Vector2(f, 0));
            }
            for (var pc : pistons.values()) {
                pc.applyForce();
            }
            // 4. 收敛判定
            double deltaI = Math.abs(iSum - prevI) / Math.max(1e-12, Math.abs(iSum));
            double deltaV = Math.abs(vSum - prevV) / Math.max(1e-12, Math.abs(vSum));
            finalI = iSum;
            finalV = vSum;
            prevI = iSum;
            prevV = vSum;
            if (deltaI < tol && deltaV < tol && iter > 0) {
                converged = true;
                break;
            }
        }
        if (!converged) {
            degraded = true;
        }
        return new StepResult(sol, converged, iter);
    }

    public boolean isDegraded() {
        return degraded;
    }

    public void setSubDt(double subDt) {
        this.subDt = subDt;
    }

    public record StepResult(CircuitEngine.DCSolution sol, boolean converged, int iterations) {
    }
}
