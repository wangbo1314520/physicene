package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.circuit.CircuitEngine;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CouplingOrchestratorTest {

    @Test
    void railRodTerminalVelocity() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        var src = new CircuitEngine.Comp();
        src.id = "src_rod1";
        src.kind = "battery";
        src.props.put("emf", 2.0);
        src.props.put("r", 0.001);
        var res = new CircuitEngine.Comp();
        res.id = "R_rod1";
        res.kind = "resistor";
        res.props.put("R", 1.0);
        c.components.add(src);
        c.components.add(res);
        c.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_rod1", 0), new CircuitEngine.PinRef("R_rod1", 0)));
        c.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_rod1", 1), new CircuitEngine.PinRef("R_rod1", 1)));
        var s = CircuitEngine.solveDC(c);
        assertTrue(s.ok);
        double i = s.elements.get("R_rod1").i();
        double iExp = 2.0 / 1.001;
        assertTrue(Math.abs(i - iExp) < 0.01, "v_m=2: I=" + i + " exp=" + iExp);
        double fAmpere = i;
        assertTrue(Math.abs(fAmpere - 2.0) < 0.01, "F_A=" + fAmpere + " ≈ 2N → v_m=FR/(B²L²)=2.00");
    }

    @Test
    void degradedPathNoException() {
        CircuitEngine.Circuit c = new CircuitEngine.Circuit();
        CouplingOrchestrator orch = new CouplingOrchestrator(c, 1.0 / 240);
        var r = orch.step(0.016);
        assertNotNull(r);
    }
}
