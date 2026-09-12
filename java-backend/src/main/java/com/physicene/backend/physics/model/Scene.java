package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 场景（SRS F2.0）：元件列表 + 全局配置。run 请求时可无 sceneId（运行期生成）。 */
@Data
public class Scene {

    private String sceneId;

    private List<PhysicsElement> elements = new ArrayList<>();

    private SimulationConfig config = new SimulationConfig();
}
