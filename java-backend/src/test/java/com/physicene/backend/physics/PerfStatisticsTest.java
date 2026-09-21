package com.physicene.backend.physics;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/** 第四十一轮 追问2：性能 5 次均值±标准差（-DperfStat=1 -DperfSub=N 触发，默认跳过） */
class PerfStatisticsTest {

    @Test
    void fiveRunsMeanStd() {
        if (!Boolean.getBoolean("perfStat")) { System.out.println("[perf-stat] skip（-DargLine=-DperfStat=true 经 argLine 传）"); return; }
        int sub = Integer.getInteger("perfSub", 4);
        List<Long> times = new java.util.ArrayList<>();
        int N = Integer.getInteger("perfN", 5);
        for (int i = 0; i < N; i++) times.add(PerfRunner.runOnce(sub));
        double mean = times.stream().mapToLong(Long::longValue).average().orElse(0);
        double std = Math.sqrt(times.stream().mapToDouble(v -> (v - mean) * (v - mean)).average().orElse(0));
        System.out.printf("[perf-stat] substeps=%d 五次=%s 均值=%.0fms 标准差=%.0fms (±%.0f%%)%n",
                sub, times, mean, std, mean > 0 ? std / mean * 100 : 0);
        System.out.println("[perf-first] 首跑=" + times.get(0) + "ms（学生新会话体验口径）");
        int plateau = -1;
        for (int i = 2; i < times.size(); i++) {
            double a = times.get(i - 2), b = times.get(i - 1), c = times.get(i);
            if (Math.abs(b - a) / a < 0.05 && Math.abs(c - b) / b < 0.05) { plateau = i - 2; break; }
        }
        double steady = plateau >= 0 ? (times.get(plateau) + times.get(plateau + 1) + times.get(plateau + 2)) / 3.0 : Double.NaN;
        System.out.println("[perf-steady] 平台起始=第" + (plateau >= 0 ? plateau + 1 : -1) + "次 稳态均值=" + String.format("%.0f", steady) + "ms");
        assertTrue(times.get(0) < (sub >= 8 ? 2800 : 1400), "首跑超预算（学生体验口径 " + times.get(0) + "ms）");
    }
}
