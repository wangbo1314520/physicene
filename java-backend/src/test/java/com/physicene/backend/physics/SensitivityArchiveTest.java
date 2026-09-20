package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 敏感性分析归档（第二十六/二十七轮制度：异常数值归因前必须扫参数看是否变——本类是「二分扫描法」模板）。
 * 归档背景：曾把「Tmax=22 场景断时刻张力 22.32」误读为「首子步冲击≈静态×1.13」——二分扫描实测证伪：
 * 绷直悬挂首段峰值 ≤ 静态×1.006 且与 substeps 无关。误读通报见交接文档第二十六轮。
 *
 * 方法论（新异常数值的标准动作）：
 *   1. 把待归因量做成可观测边界（此处：Tmax 断/不断边界 = 张力峰值）
 *   2. 扫关键参数（此处 dt=substeps）——随参数变=数值伪影；不变=物理本征
 *   3. 原始数据（本测试输出）与结论一并写交接文档
 */
class SensitivityArchiveTest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new RopeElementFactory());
        return new ElementRegistry(factories);
    }

    /** 绷直悬挂 m=1（静态 T=mg=9.8N），Tmax 断/不断边界 = 首段张力峰值 */
    private static boolean breaks(double tmax, int substeps) {
        PhysicsElement blk = new PhysicsElement();
        blk.setId("blk"); blk.setType("cube"); blk.setPosition(new Vector2D(0, -2.1));
        blk.getProperties().setMass(1); blk.getProperties().setFriction(0);
        blk.getParams().put("fixRot", 1.0);
        PhysicsElement rope = new PhysicsElement();
        rope.setId("r1"); rope.setType("rope"); rope.setPosition(new Vector2D(0, 0.4));
        rope.setConnectTo("blk"); rope.setAnchorA(new Vector2D(0, 0.5));
        Map<String, Double> pr = new HashMap<>();
        pr.put("jointLength", 2.0);
        pr.put("tMax", tmax);
        rope.setParams(pr);
        Scene sc = new Scene();
        sc.setElements(List.of(blk, rope));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(0.3);
        cfg.setSubsteps(substeps);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("t-sens", sc, registry());
        in.runToEndSync();
        return in.getKeyEvents().stream().anyMatch(e -> "rope_break".equals(e.getType()));
    }

    @Test
    void tautHangPeakTensionDtInvariant() {
        // 内嵌二分取断/不断边界（=首段张力峰值），断言：三个 substeps 的峰值全部 ≤ 静态×1.01（dt 无关）
        double staticT = 9.8;
        for (int sub : new int[]{ 4, 8, 16 }) {
            double lo = staticT, hi = staticT * 1.5;   // lo=静态（恰等不比较）；hi 必断
            if (!breaks(hi, sub)) {
                continue;   // 0.3s 内永不断（更好）
            }
            for (int i = 0; i < 12; i++) {
                double mid = (lo + hi) / 2;
                if (breaks(mid, sub)) { hi = mid; } else { lo = mid; }
            }
            assertTrue(hi <= staticT * 1.01,
                    "sub=" + sub + " 绷直悬挂首段峰值=" + String.format("%.3f", hi)
                            + "N 超过静态×1.01=" + String.format("%.3f", staticT * 1.01)
                            + "N——若随 sub 变化即 dt 相关冲击伪影，按第二十六轮方法论重查");
        }
    }
}
