package com.physicene.backend.physics.model;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 阶段二 DoD #5/#6：frameV:2 通道按需 + 帧 JSON < 4 KB */
class FrameV2Test {

    @Test
    void channelsOptional() {
        Frame f = new Frame(0.016, null, "full");
        f.setFrameV(2);
        assertNull(f.getCircuit(), "无通道场景 circuit 缺省");
        assertNull(f.getThermal());
        assertNull(f.getProbes());
    }

    @Test
    void frameJsonUnder4KB() throws Exception {
        Frame f = new Frame(1.23, null, "full");
        f.setFrameV(2);
        Map<String, Double> cir = new LinkedHashMap<>();
        for (int i = 0; i < 20; i++) {
            cir.put("branch_" + i, 1.234567);
        }
        f.setCircuit(cir);
        f.setThermal(Map.of("g1", new double[]{101325.0, 0.001, 300.0}));
        f.setProbes(Map.of("gate1", new double[]{0.87, 4.02}));
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(f);
        assertTrue(json.getBytes().length < 4096, "帧 JSON=" + json.getBytes().length + " B < 4 KB");
    }
}
