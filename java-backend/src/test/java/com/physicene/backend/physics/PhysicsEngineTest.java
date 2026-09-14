package com.physicene.backend.physics;

import com.physicene.backend.physics.element.BFieldFactory;
import com.physicene.backend.physics.element.CubeElementFactory;
import com.physicene.backend.physics.element.EFieldFactory;
import com.physicene.backend.physics.element.ElementBehaviorFactory;
import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.element.PointChargeFactory;
import com.physicene.backend.physics.element.SlopeElementFactory;
import com.physicene.backend.physics.element.SphereElementFactory;
import com.physicene.backend.physics.element.WallElementFactory;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.InitialState;
import com.physicene.backend.physics.model.KeyEvent;
import com.physicene.backend.physics.model.FullSnapshot;
import com.physicene.backend.physics.model.PhysicalProperties;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.SubjectState;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 物理引擎核心精度测试（任务清单 Day 8 / Day 14 验收依据）。
 * 不启 Spring，直接实例化元件工厂验证纯引擎逻辑。
 */
class PhysicsEngineTest {

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(),
                new SphereElementFactory(), new SlopeElementFactory(),
                new PointChargeFactory(), new EFieldFactory(), new BFieldFactory());
        return new ElementRegistry(factories);
    }

    private static PhysicsElement charge(String id, double x, double y, double vx, double vy,
                                         double mass, double charge) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id);
        e.setType("point_charge");
        e.setPosition(new Vector2D(x, y));
        PhysicalProperties p = new PhysicalProperties();
        p.setMass(mass);
        p.setCharge(charge);
        e.setProperties(p);
        InitialState init = new InitialState();
        init.setVelocity(new Vector2D(vx, vy));
        e.setInitialState(init);
        return e;
    }

    private static PhysicsElement fieldRegion(String id, String type, double x, double y,
                                              double w, double h, Double bField, String bDir,
                                              Double eX, Double eY) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id);
        e.setType(type);
        e.setPosition(new Vector2D(x, y));
        e.setScale(new Vector2D(w, h));
        PhysicalProperties p = new PhysicalProperties();
        p.setBField(bField);
        p.setBDirection(bDir);
        p.setEFieldX(eX);
        p.setEFieldY(eY);
        e.setProperties(p);
        return e;
    }

    /**
     * 电磁实验①：带电粒子在匀强磁场中做圆周运动（选择性必修）。
     * m=1, v=4, q=+1, B=1(out) → r = mv/(qB) = 4 m，周期 T = 2πm/(qB) ≈ 6.28 s。
     */
    @Test
    void chargedParticleCircularMotionInBField() {
        Scene scene = new Scene();
        scene.setElements(List.of(
                charge("pc", 0, 0, 0, 4, 1, 1),
                fieldRegion("bf", "b_field", 0, 0, 30, 30, 1.0, "out", null, null)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setGravity(Vector2D.ZERO);
        cfg.setMaxDuration(7.0); // 略超一个周期
        scene.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("test-bfield", scene, registry());
        double maxRadiusError = 0;
        double startX = 0, startY = 0;
        boolean returnedNearStart = false;
        for (int i = 0; i < 420; i++) { // 7s = 420 步
            instance.step();
            if (instance.isEnded()) {
                break;
            }
            FullSnapshot snap = (FullSnapshot) instance.latestFrame().getSnapshot();
            SubjectState s = snap.getElements().get(0);
            if (i > 6) { // 稳定后测距圆心 (4,0) 的半径
                double r = Math.hypot(s.x() - 4.0, s.y() - 0.0);
                maxRadiusError = Math.max(maxRadiusError, Math.abs(r - 4.0));
            }
            if (i > 360 && Math.hypot(s.x() - startX, s.y() - startY) < 0.35) {
                returnedNearStart = true; // 一圈回到出发点附近
            }
        }
        assertTrue(maxRadiusError < 0.35, "圆周半径≈4m（半隐式欧拉旋转力漂移<9%，误差=" + maxRadiusError + "）");
        assertTrue(returnedNearStart, "一个周期后应回到出发点附近（周期 ≈6.28s）");
    }

    /**
     * 电磁实验②：带电粒子进入匀强电场发生偏转（示波器偏转模型）。
     * q=+1, m=1, v0x=5, E=(0,-2) → a=−2 m/s²；t=1s 时 x≈−5、y≈−1、vy≈−2。
     */
    @Test
    void chargedParticleDeflectionInEField() {
        Scene scene = new Scene();
        scene.setElements(List.of(
                charge("pc", -10, 0, 5, 0, 1, 1),
                fieldRegion("ef", "e_field", 1, 0, 22, 10, null, null, 0.0, -2.0)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setGravity(Vector2D.ZERO);
        cfg.setMaxDuration(3.0);
        scene.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("test-efield", scene, registry());
        instance.step(); // t=1/60 起，累计到 t≈1s
        while (!instance.isEnded() && instance.getCurrentT() < 1.0) {
            instance.step();
        }
        FullSnapshot snap = (FullSnapshot) instance.latestFrame().getSnapshot();
        SubjectState s = snap.getElements().get(0);
        assertTrue(Math.abs(s.x() - (-5.0)) < 0.1, "t=1s x≈-5（实际 " + s.x() + "）");
        assertTrue(Math.abs(s.y() - (-1.0)) < 0.1, "t=1s y≈-1 抛物线（实际 " + s.y() + "）");
        assertTrue(Math.abs(s.vy() - (-2.0)) < 0.1, "vy≈-2（实际 " + s.vy() + "）");
    }

    private static PhysicsElement cube(String id, double x, double y, double vx, double vy,
                                       double mass, double friction, double restitution) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id);
        e.setType("cube");
        e.setPosition(new Vector2D(x, y));
        PhysicalProperties p = new PhysicalProperties();
        p.setMass(mass);
        p.setFriction(friction);
        p.setRestitution(restitution);
        e.setProperties(p);
        InitialState init = new InitialState();
        init.setVelocity(new Vector2D(vx, vy));
        e.setInitialState(init);
        return e;
    }

    /** Day 8 验收：自由落体 1 秒下落 4.0~5.5 m（理论值 ½gt² = 4.9 m，容差含积分器误差） */
    @Test
    void freeFallOneSecond() {
        Scene scene = new Scene();
        scene.setElements(List.of(cube("cube_001", 0, 10, 0, 0, 1, 0, 0)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(1.0); // 1 秒后由 maxDuration 停止
        scene.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("test-freefall", scene, registry());
        instance.runToEndSync();

        Frame last = instance.latestFrame();
        assertNotNull(last, "应产生至少一帧");
        FullSnapshot snapshot = (FullSnapshot) last.getSnapshot();
        SubjectState s = snapshot.getElements().get(0);

        double fall = 10 - s.y();
        assertTrue(fall > 4.0 && fall < 5.5,
                "1s 下落距离应在 4.0~5.5m，实际 " + fall);
        assertEquals(60, instance.getFrameCount(), "1s 应为 60 帧");
        assertTrue(Math.abs(s.vy() + 9.8) < 0.5, "末速度≈-9.8 m/s，实际 " + s.vy());
    }

    /**
     * Day 14 验收：两方块弹性碰撞（e=1, m 相等, 无摩擦, 零重力，对齐模板 F2.1 场景）。
     * 等质量弹性正碰 → 速度交换；系统总动量守恒（碰撞前后均 ≈ 0）。
     */
    @Test
    void elasticCollisionMomentumConservation() {
        Scene scene = new Scene();
        // F2.1 模板配置：两 cube 相向 5 m/s，地面 wall，gravity=0
        PhysicsElement car1 = cube("cube_001", -3, 0.5, 5, 0, 1, 0, 1.0);
        PhysicsElement car2 = cube("cube_002", 3, 0.5, -5, 0, 1, 0, 1.0);
        PhysicsElement ground = new PhysicsElement();
        ground.setId("wall_001");
        ground.setType("wall");
        ground.setPosition(new Vector2D(0, -0.1));
        ground.setScale(new Vector2D(20, 0.2));
        scene.setElements(List.of(car1, car2, ground));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setGravity(Vector2D.ZERO);
        cfg.setMaxDuration(2.0);
        scene.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("test-collision", scene, registry());

        double pBefore = 0;
        boolean[] sawCollision = {false};
        instance.addKeyEventListener(ev -> {
            if ("collision".equals(ev.getType())) {
                sawCollision[0] = true;
            }
        });
        instance.runToEndSync();

        // 碰撞关键事件必须发生
        assertTrue(sawCollision[0] || instance.getKeyEvents().stream()
                        .anyMatch(ev -> "collision".equals(ev.getType())),
                "应产生 collision 关键事件");

        FullSnapshot last = (FullSnapshot) instance.latestFrame().getSnapshot();
        SubjectState s1 = last.getElements().get(0);
        SubjectState s2 = last.getElements().get(1);

        // 等质量弹性正碰：速度交换（v1: +5→-5，v2: -5→+5）
        assertTrue(Math.abs(s1.vx() + 5) < 0.15, "碰后 v1 应≈-5，实际 " + s1.vx());
        assertTrue(Math.abs(s2.vx() - 5) < 0.15, "碰后 v2 应≈+5，实际 " + s2.vx());

        // 总动量守恒（碰前 = 0）
        double pAfter = 1 * s1.vx() + 1 * s2.vx();
        assertTrue(Math.abs(pAfter - pBefore) < 0.05, "总动量应守恒≈0，实际 " + pAfter);

        // 动能守恒（e=1 完全弹性）
        double ekBefore = 0.5 * 1 * 25 * 2;
        double ekAfter = 0.5 * (s1.vx() * s1.vx() + s1.vy() * s1.vy())
                + 0.5 * (s2.vx() * s2.vx() + s2.vy() * s2.vy());
        assertTrue(Math.abs(ekAfter - ekBefore) / ekBefore < 0.01,
                "弹性碰撞动能守恒，碰前 " + ekBefore + " 碰后 " + ekAfter);
    }

    /** Day 9 验收：注册表收录全部元件类型；未知类型拒绝 */
    @Test
    void elementRegistry() {
        ElementRegistry reg = registry();
        assertEquals(7, reg.supportedTypes().size(), "元件：cube/sphere/slope/wall + 电磁三件套");
        assertTrue(reg.supports("cube") && reg.supports("wall") && reg.supports("point_charge") && reg.supports("e_field") && reg.supports("b_field")
                && reg.supports("sphere") && reg.supports("slope"));

        PhysicsElement bad = new PhysicsElement();
        bad.setId("x");
        bad.setType("lens"); // v2 元件
        bad.setPosition(new Vector2D(0, 0));
        assertThrows(IllegalArgumentException.class, () -> reg.create(bad));
    }

    /** 暂停/单步/seek 控制语义（F2.4） */
    @Test
    void pauseStepSeekControls() {
        Scene scene = new Scene();
        scene.setElements(List.of(cube("cube_001", 0, 10, 0, 0, 1, 0, 0)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(1.0);
        scene.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("test-ctrl", scene, registry());
        instance.pause();
        for (int i = 0; i < 30; i++) {
            instance.stepOnce(); // 暂停下单步 30 帧 = 0.5s
        }
        assertEquals(30, instance.getFrameCount());
        assertEquals(0.5, instance.getCurrentT(), 1e-9);

        Frame seeked = instance.seek(0.2);
        assertNotNull(seeked);
        assertTrue(seeked.getT() <= 0.2 + 1e-9, "seek 返回最近帧");

        instance.resume();
        instance.runToEndSync();
        assertTrue(instance.isEnded());
    }
    /**
     * 电磁实验③：库仑力——同种电荷相斥、异种相吸（必修三 静电场）。
     */
    @Test
    void coulombForceRepulsionAndAttraction() {
        Scene scene = new Scene();
        scene.setElements(List.of(
                charge("q1", -2, 0, 0, 0, 1, 2),
                charge("q2", 2, 0, 0, 0, 1, 1)));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setGravity(Vector2D.ZERO);
        cfg.setMaxDuration(3.0);
        scene.setConfig(cfg);

        SimulationInstance instance = new SimulationInstance("test-coulomb", scene, registry());
        instance.step();
        FullSnapshot snap = (FullSnapshot) instance.latestFrame().getSnapshot();
        SubjectState s1 = snap.getElements().get(0);
        SubjectState s2 = snap.getElements().get(1);
        assertTrue(s1.vx() < -0.01, "q1 应向左远离（实际 vx=" + s1.vx() + "）");
        assertTrue(s2.vx() > 0.01, "q2 应向右远离（实际 vx=" + s2.vx() + "）");

        Scene scene2 = new Scene();
        scene2.setElements(List.of(
                charge("q1", -3, 0, 0, 0, 1, 2),
                charge("q2", 3, 0, 0, 0, 1, -1)));
        scene2.setConfig(cfg);
        SimulationInstance instance2 = new SimulationInstance("test-coulomb2", scene2, registry());
        instance2.step();
        FullSnapshot snap2 = (FullSnapshot) instance2.latestFrame().getSnapshot();
        assertTrue(snap2.getElements().get(0).vx() > 0.01, "异种电荷 q1 应向右靠近");
        assertTrue(snap2.getElements().get(1).vx() < -0.01, "异种电荷 q2 应向左靠近");
    }
}