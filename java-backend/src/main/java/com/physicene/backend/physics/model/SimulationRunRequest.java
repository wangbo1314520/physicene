package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * POST /api/simulations/run 请求体。
 * Week 2：直接携带完整场景（无持久化层）；Week 3 起 scenes 入库后改为 {sceneId}，
 * 兼容期内两种形态并存（有 sceneId 则查库，否则用内联场景）。
 */
@Data
public class SimulationRunRequest {

    /** Week 3 接场景库后启用 */
    private String sceneId;

    private List<PhysicsElement> elements = new ArrayList<>();

    private SimulationConfig config = new SimulationConfig();
}
