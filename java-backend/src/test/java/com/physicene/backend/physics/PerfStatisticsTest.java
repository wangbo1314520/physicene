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
        for (int i = 0; i < 5; i++) times.add(PerfRunner.runOnce(sub));
        double mean = times.stream().mapToLong(Long::longValue).average().orElse(0);
        double std = Math.sqrt(times.stream().mapToDouble(v -> (v - mean) * (v - mean)).average().orElse(0));
        System.out.printf("[perf-stat] substeps=%d 五次=%s 均值=%.0fms 标准差=%.0fms (±%.0f%%)%n",
                sub, times, mean, std, mean > 0 ? std / mean * 100 : 0);
        assertTrue(mean < (sub >= 8 ? 2800 : 1400), "均值超预算（" + mean + "ms）");
    }
}
