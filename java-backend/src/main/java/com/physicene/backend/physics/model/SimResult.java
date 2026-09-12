package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 仿真结果（SRS F2.7）。Week 2 内存态；Week 3 序列化存 ExperimentRecord.sim_result。 */
@Data
public class SimResult {

    private String simId;

    private String type;

    private Scene scene;

    private double timestep;

    private double totalDuration;

    private List<Frame> frames = new ArrayList<>();

    private List<DataRow> dataTable = new ArrayList<>();

    /** key 为图表类型（多主体曲线用 "v-t:{elementId}"） */
    private Map<String, ChartData> charts = new LinkedHashMap<>();

    private List<KeyEvent> keyEvents = new ArrayList<>();

    private List<FrameIndexEntry> frameIndex = new ArrayList<>();

    private CameraInfo camera = new CameraInfo();
}
