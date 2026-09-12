package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 图表数据（SRS F2.9，chartType 白名单 v-t/x-t/Ek-t/p-t/r-t）。
 * 实现约定：多主体曲线的 chart key 为 "v-t:{elementId}"，chartType 字段仍取白名单值。
 */
@Data
public class ChartData {

    private String chartType;

    private String xLabel;

    private String yLabel;

    private List<Double> xData = new ArrayList<>();

    private List<Double> yData = new ArrayList<>();

    private List<KeyEvent> annotations = new ArrayList<>();
}
