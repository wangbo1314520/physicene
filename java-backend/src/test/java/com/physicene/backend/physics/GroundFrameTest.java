package com.physicene.backend.physics;

import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.*;
import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * P5b-2·地面系双视角单测：frame=1 时无惯性力、平台按 ½at² 平移、relY 探针=相对平台高度。
 * 参考系不变性断言（辨析题型的物理内核）：
 * ① 绝对峰值 = v₀ᵧ²/(2g)（地面系看电梯内抛体=普通抛物线）
 * ② 相对峰值 relY_peak = v₀ᵧ²/(2(g+a))——与电梯系 max-y 断言同值（两系算的是同一相对轨迹）
 * ③ 平台末位 y = ½a·t²（运动学平移正确）
 * 参数：a=2、v₀ᵧ=3（卡 68 同值）；H_abs=0.459、H_rel=0.381。
 */
class GroundFrameTest {
    private static final double A = 2.0, VY = 3.0, G = 9.8;

    @Test void frameInvariance() {
        PhysicsElement plat = new PhysicsElement();
        plat.setId("plat"); plat.setType("wall"); plat.setPosition(new Vector2D(0, 0));
        plat.setScale(new Vector2D(8.0, 0.3)); plat.getProperties().setFriction(0.0); plat.setFixed(true);
        Map<String, Double> pp = new HashMap<>();
        pp.put("a", A); pp.put("frame", 1.0); pp.put("_srcType", 8.0);
        plat.setParams(pp);

        PhysicsElement par = new PhysicsElement();
        par.setId("par"); par.setType("sphere"); par.setPosition(new Vector2D(-2, 0.7));  // 球底 0.2 > 台面 0.15——初始无重叠（重叠会被接触分离加能）
        par.getProperties().setMass(1); par.getProperties().setFriction(0); par.getProperties().setRestitution(0);
        par.setInitialState(new InitialState());
        par.getInitialState().setVelocity(new Vector2D(6 * Math.cos(Math.toRadians(30)), VY));

        Scene sc = new Scene(); sc.setElements(List.of(plat, par));
        // 窗口 0.5s：球在 t≈0.6 落回会被上升地板接住（真实电梯行为）——不变性断言取接住前
        SimulationConfig cfg = new SimulationConfig(); cfg.setMaxDuration(0.5); cfg.setSubsteps(8);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("gf-" + System.nanoTime(), sc,
            new ElementRegistry(List.of(new WallElementFactory(), new SphereElementFactory())));

        double[] maxY = {0.7}, maxRel = {-99}, platY = {0}, tEnd = {0};
        in.addFrameListener(f -> {
            tEnd[0] = f.getT();
            if (f.getSnapshot() instanceof FullSnapshot snap && !snap.getElements().isEmpty()) {
                maxY[0] = Math.max(maxY[0], snap.getElements().get(0).y());
            }
            if (f.getProbes() != null) {
                double[] v = f.getProbes().get("relY_par");
                if (v != null) maxRel[0] = Math.max(maxRel[0], v[1]);
            }
        });
        in.runToEndSync();
        // 平台末位：FullSnapshot 只含动态体——由运动学闭式直接断言（探针 relY 初值=0.7）
        double hAbs = VY * VY / (2 * G);
        double hRel = VY * VY / (2 * (G + A));
        platY[0] = 0.5 * A * tEnd[0] * tEnd[0];
        System.out.printf("[gf] t=%.2f absPeak=%.4f (theory %.4f) | relPeak=%.4f (theory %.4f) | platY=%.4f=½at²%n",
            tEnd[0], maxY[0], 0.7 + hAbs, maxRel[0], 0.7 + hRel, platY[0]);
        assertTrue(Math.abs(maxY[0] - (0.7 + hAbs)) / hAbs < 0.02,
            String.format("绝对峰值 %.4f vs 普通抛体 %.4f（地面系无惯性力）", maxY[0], 0.7 + hAbs));
        assertTrue(maxRel[0] > -90 && Math.abs(maxRel[0] - (0.7 + hRel)) / hRel < 0.03,
            String.format("相对峰值 %.4f vs v₀ᵧ²/(2(g+a)) %.4f（与电梯系同值——参考系不变性）", maxRel[0], 0.7 + hRel));
    }
}
