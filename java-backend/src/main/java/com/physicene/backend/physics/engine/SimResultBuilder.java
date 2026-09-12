package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.model.CameraInfo;
import com.physicene.backend.physics.model.ChartData;
import com.physicene.backend.physics.model.DataRow;
import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.FrameIndexEntry;
import com.physicene.backend.physics.model.KeyEvent;
import com.physicene.backend.physics.model.SimResult;
import com.physicene.backend.physics.model.SubjectState;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SimResult 构建器（设计文档 SimResultBuilder 职责）：
 * 帧序列 → 数据表 → v-t/Ek-t/p-t 图表 + 关键事件 + 帧索引。
 */
public final class SimResultBuilder {

    private SimResultBuilder() {
    }

    public static SimResult build(SimulationInstance instance) {
        SimResult result = new SimResult();
        result.setSimId(instance.getSimId());
        result.setType(instance.getScene().getElements().isEmpty()
                ? "free_build" : "free_build");
        result.setScene(instance.getScene());
        result.setTimestep(instance.getDt());
        result.setTotalDuration(instance.getCurrentT());

        FrameCache cache = instance.getFrameCache();
        List<Frame> frames = new ArrayList<>(cache.size());
        List<FrameIndexEntry> frameIndex = new ArrayList<>(cache.size());
        for (int i = 0; i < cache.size(); i++) {
            frames.add(cache.frameAt(i));
            frameIndex.add(new FrameIndexEntry(i, cache.timeAt(i)));
        }
        result.setFrames(frames);
        result.setFrameIndex(frameIndex);

        List<DataRow> dataTable = new ArrayList<>(instance.getDataTable());
        result.setDataTable(dataTable);
        result.setKeyEvents(new ArrayList<>(instance.getKeyEvents()));

        result.setCharts(buildCharts(instance, dataTable));
        result.setCamera(new CameraInfo());
        return result;
    }

    private static Map<String, ChartData> buildCharts(SimulationInstance instance, List<DataRow> dataTable) {
        Map<String, ChartData> charts = new LinkedHashMap<>();
        int n = instance.getDynamicElements().size();
        if (n == 0 || dataTable.isEmpty()) {
            return charts;
        }

        // 每个运动主体一条 v-t 曲线（key 规范 "v-t:{id}"，chartType 仍为白名单 "v-t"）
        for (int i = 0; i < n; i++) {
            String id = instance.getDynamicElements().get(i).getId();
            ChartData chart = new ChartData();
            chart.setChartType("v-t");
            chart.setXLabel("t / s");
            chart.setYLabel("|v" + (i + 1) + "| / (m·s⁻¹)");
            for (DataRow row : dataTable) {
                chart.getXData().add(row.getT());
                chart.getYData().add(row.getFields().get("v" + (i + 1)));
            }
            chart.setAnnotations(annotationsNear(instance.getKeyEvents()));
            charts.put("v-t:" + id, chart);
        }

        ChartData ek = new ChartData();
        ek.setChartType("Ek-t");
        ek.setXLabel("t / s");
        ek.setYLabel("Ek / J");
        for (DataRow row : dataTable) {
            ek.getXData().add(row.getT());
            ek.getYData().add(row.getFields().get("Ek"));
        }
        charts.put("Ek-t", ek);

        ChartData p = new ChartData();
        p.setChartType("p-t");
        p.setXLabel("t / s");
        p.setYLabel("p / (kg·m·s⁻¹)");
        for (DataRow row : dataTable) {
            p.getXData().add(row.getT());
            p.getYData().add(row.getFields().get("p"));
        }
        charts.put("p-t", p);

        return charts;
    }

    private static List<KeyEvent> annotationsNear(List<KeyEvent> keyEvents) {
        return new ArrayList<>(keyEvents);
    }
}
