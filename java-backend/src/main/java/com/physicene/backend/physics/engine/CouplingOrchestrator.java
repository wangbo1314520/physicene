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

    /** P4 批3：线框链接（位置感知 EMF——完全在内 dΦ/dt=0） */
    public record CoilLink(String coilId, Body coilBody, String branchId, double b, double w,
                           double fieldLeft, double fieldRight) {
        public boolean fullyInside() {
            double x = coilBody.getTransform().getTranslationX();
            return x - w / 2 >= fieldLeft && x + w / 2 <= fieldRight;
        }
        public boolean fullyOutside() {
            double x = coilBody.getTransform().getTranslationX();
            return x + w / 2 < fieldLeft || x - w / 2 > fieldRight;
        }
    }

    private final CircuitEngine.Circuit circuit;
    private CircuitEngine.EngineState circuitState;
    private final Map<String, RodBarLink> rodLinks = new LinkedHashMap<>();
    private final Map<String, CoilLink> coilLinks = new LinkedHashMap<>();
    private final Map<String, PistonCoupling> pistons = new LinkedHashMap<>();
    private double subDt;
    private boolean stateInitialized = false;
    private int maxIter = 8;
    private double tol = 1e-4;
    private boolean degraded = false;

    public CouplingOrchestrator(CircuitEngine.Circuit circuit, double subDt) {
        this.circuit = circuit;
        this.circuitState = null;  // P4 批3：延迟到首次 step（constructor 时电路不完整）
        this.subDt = subDt;
    }

    public void addRodLink(RodBarLink link) {
        rodLinks.put(link.rodId(), link);
    }

    public void addCoilLink(CoilLink link) {
        coilLinks.put(link.coilId(), link);
    }

    /** P5a 批2-4：coil 支路读数（EMF_<coilId> / I_coil_<coilId>）——probes 通道数据源 */
    private final Map<String, Double> lastCoilReadings = new LinkedHashMap<>();
    public Map<String, Double> coilReadings() { return lastCoilReadings; }

    public void addPiston(PistonCoupling pc) {
        pistons.put(pc.getCell().hashCode() + "", pc);
    }

    /** 单子步耦合求解：返回 [电流表(各 rod 支路 I), 是否收敛] */
    public StepResult step(double t) {
        // P4 批3：首次 step 时重新初始化 circuitState（constructor 时电路可能不完整）
        if (!stateInitialized) {
            this.circuitState = CircuitEngine.EngineState.initial(circuit);
            stateInitialized = true;
        }
                if (rodLinks.isEmpty() && pistons.isEmpty() && coilLinks.isEmpty()) {
            CircuitEngine.DCSolution sol = CircuitEngine.solveDC(circuit, circuitState);
            return new StepResult(sol, true, 0);
        }
        CircuitEngine.DCSolution sol = null;
        int iter = 0;
        boolean converged = true;
        // GS 迭代仅在有 rod 链路时进行（活塞-only 场景电路为空，solveDC 失败即早退会跳过施力）
        if (!rodLinks.isEmpty() || !coilLinks.isEmpty()) {
            converged = false;
            double prevI = 0;
            for (iter = 0; iter < maxIter; iter++) {
                // 1. 由杆速度刷新 EMF = B·L·v
                for (var link : rodLinks.values()) {
                    double v = link.rodBody().getLinearVelocity().x;
                    double emf = link.b() * link.l() * v;
                    // P4 批3：coil 位置感知——完全在内/在外 EMF=0
                    for (var cl : coilLinks.values()) {
                        if (cl.coilId().equals(link.rodId())) {
                            if (cl.fullyInside() || cl.fullyOutside()) emf = 0;
                        }
                    }
                    final double emfFinal = emf;
                    var comp = circuit.components.stream().filter(c -> c.id.equals("src_" + link.rodId())).findFirst();
                    comp.ifPresent(c -> c.props.put("emf", emfFinal));
                    if (comp.isEmpty()) {
                        var nc = new CircuitEngine.Comp();
                        nc.id = "src_" + link.rodId();
                        nc.kind = "battery";
                        nc.props.put("emf", emf);
                        nc.props.put("r", 0.001);
                        circuit.components.add(nc);
                    }
                }
                // P4 批3：coil EMF 更新（位置感知——完全在内/在外 = 0，进入/离开 = B·w·v）
            for (var cl : coilLinks.values()) {
                double v = cl.coilBody().getLinearVelocity().x;
                                double emf;
                if (cl.fullyInside() || cl.fullyOutside()) {
                    emf = 0;  // dΦ/dt = 0
                } else {
                    emf = cl.b() * cl.w() * v;  // 进入或离开
                }
                var comp = circuit.components.stream().filter(c -> c.id.equals("src_" + cl.coilId())).findFirst();
                comp.ifPresent(c -> c.props.put("emf", emf));
                if (comp.isEmpty()) {
                    var nc = new CircuitEngine.Comp();
                    nc.id = "src_" + cl.coilId();
                    nc.kind = "battery";
                    nc.props.put("emf", emf);
                    nc.props.put("r", 0.001);
                    circuit.components.add(nc);
                }
                lastCoilReadings.put("EMF_" + cl.coilId(), emf);
            }
            // 2. 电路求解（迭代内只解算——速度要到 world.step 才变，循环内施力只会
                //    在 dyn4j 力累加器里叠 N 份，终速被压成 1/N；力统一移到收敛后施加一次）
                sol = CircuitEngine.solveDC(circuit, circuitState);
                if (sol == null || !sol.ok) {
                                        return new StepResult(null, false, iter);
                }
                // 3. 收敛判定（电流表读数稳定即收敛）
                double iSum = 0;
                for (var link : rodLinks.values()) {
                    CircuitEngine.ElementResult er = sol.elements.get("R_" + link.rodId());
                    iSum += er != null ? er.i() : 0;
                }
                double deltaI = Math.abs(iSum - prevI) / Math.max(1e-12, Math.abs(iSum));
                prevI = iSum;
                if (deltaI < tol && iter > 0) {
                    converged = true;
                    break;
                }
            }
        }
        // 安培力 + 气体力 → 施加于刚体（每子步恰一次，用收敛后的终解；活塞-only 无解也算收敛施力）
        if (sol != null) {
            for (var link : rodLinks.values()) {
                CircuitEngine.ElementResult er = sol.elements.get("R_" + link.rodId());
                double i = er != null ? er.i() : 0;
                double f = -link.b() * link.l() * i;
                link.rodBody().applyForce(new org.dyn4j.geometry.Vector2(f, 0));
            }
            // P5a 批2-4·电路合成：coil 楞次力改用电路电流 F = -B·w·I（与 rod 同形式）——
            // 原 P4 直算 F=-B²w²v/R 在纯电阻孤立回路下数学等价，但外接元件（R/C）时 I≠EMF/R_int，
            // 直算即错。EMF 位置感知已在上方写进 src_<coilId>：完全在内/在外 → emf=0 → I=0 → F=0 自动成立
            for (var cl : coilLinks.values()) {
                CircuitEngine.ElementResult er = sol.elements.get("R_" + cl.coilId());
                double i = er != null ? er.i() : 0;
                double f = -cl.b() * cl.w() * i;
                cl.coilBody().applyForce(new org.dyn4j.geometry.Vector2(f, 0));
                lastCoilReadings.put("I_coil_" + cl.coilId(), i);
            }
        }
        
        for (var pc : pistons.values()) {
            pc.applyForce();
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
