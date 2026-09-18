package com.physicene.backend.physics;

import com.physicene.backend.physics.element.BeltElementFactory;
import com.physicene.backend.physics.element.BFieldFactory;
import com.physicene.backend.physics.element.CubeElementFactory;
import com.physicene.backend.physics.element.EFieldFactory;
import com.physicene.backend.physics.element.ElementBehaviorFactory;
import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.element.LoopTrackElementFactory;
import com.physicene.backend.physics.element.PointChargeFactory;
import com.physicene.backend.physics.element.PulleyElementFactory;
import com.physicene.backend.physics.element.RodElementFactory;
import com.physicene.backend.physics.element.RopeElementFactory;
import com.physicene.backend.physics.element.SlopeElementFactory;
import com.physicene.backend.physics.element.SphereElementFactory;
import com.physicene.backend.physics.element.SpringElementFactory;
import com.physicene.backend.physics.element.WallElementFactory;
import com.physicene.backend.physics.engine.SceneValidator;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 阶段一 SceneValidator 新类型校验（方案 §3.7）：L1 白名单 / L2 参数域 / L3 结构与警告 */
class SceneValidatorUnifyTest {

    private final SceneValidator validator = new SceneValidator(registry());

    private static ElementRegistry registry() {
        List<ElementBehaviorFactory> factories = List.of(
                new CubeElementFactory(), new WallElementFactory(), new SphereElementFactory(),
                new SlopeElementFactory(), new PointChargeFactory(), new EFieldFactory(), new BFieldFactory(),
                new RopeElementFactory(), new RodElementFactory(), new SpringElementFactory(),
                new PulleyElementFactory(), new BeltElementFactory(), new LoopTrackElementFactory());
        return new ElementRegistry(factories);
    }

    private static PhysicsElement el(String id, String type, double x, double y) {
        PhysicsElement e = new PhysicsElement();
        e.setId(id);
        e.setType(type);
        e.setPosition(new Vector2D(x, y));
        return e;
    }

    @Test
    void beltMustBeFixedAndSpeedInRange() {
        PhysicsElement belt = el("b1", "belt", 0, 0);
        belt.setFixed(false); // 错：未固定
        belt.setParams(new HashMap<>(java.util.Map.of("beltSpeed", 12.0)));
        Scene sc = new Scene();
        sc.setElements(List.of(belt));
        sc.setConfig(new SimulationConfig());
        var r = validator.validate(sc);
        assertFalse(r.isValid(), "belt 未固定 + 带速超界应报错");
        assertTrue(r.getErrors().stream().anyMatch(e -> e.getField().contains("belt") && e.getLevel().equals("error")));
    }

    @Test
    void loopTrackRadiusAndSideDomain() {
        PhysicsElement t = el("t1", "loop_track", 0, 0);
        t.setFixed(true);
        t.setParams(new HashMap<>(java.util.Map.of("radius", 8.0, "arcSideCode", 3.0)));
        Scene sc = new Scene();
        sc.setElements(List.of(t));
        sc.setConfig(new SimulationConfig());
        var r = validator.validate(sc);
        assertFalse(r.isValid(), "radius=8 + side=3 应报错");
    }

    @Test
    void ropeMustConnectExistingTarget() {
        PhysicsElement rope = el("r1", "rope", 0, 0);
        rope.setParams(new HashMap<>(java.util.Map.of("jointLength", -1.0)));
        rope.setConnectTo("ghost"); // 不存在
        PhysicsElement ball = el("ball_001", "sphere", 0, -1);
        Scene sc = new Scene();
        sc.setElements(List.of(rope, ball));
        sc.setConfig(new SimulationConfig());
        var r = validator.validate(sc);
        assertFalse(r.isValid(), "绳连接不存在目标 + 负长度应报错");
    }

    @Test
    void pulleySubstepsWarningWhenLt4() {
        PhysicsElement p = el("p1", "pulley", 0, 3);
        p.setParams(new HashMap<>(java.util.Map.of("ratio", 1.0)));
        p.setConnectTo("a");
        p.setConnectTo2("b");
        PhysicsElement a = el("a", "cube", -1, 2);
        PhysicsElement b = el("b", "cube", 1, 2);
        Scene sc = new Scene();
        sc.setElements(List.of(p, a, b));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setSubsteps(1); // 应触发 L3 警告
        sc.setConfig(cfg);
        var r = validator.validate(sc);
        assertTrue(r.isValid(), "警告不阻断");
        assertTrue(r.getErrors().stream().anyMatch(e -> "config.substeps".equals(e.getField()) && "warning".equals(e.getLevel())),
                "substeps<4 且含 pulley 应警告");
    }

    @Test
    void validScenePasses() {
        PhysicsElement belt = el("b1", "belt", 0, 0);
        belt.setFixed(true);
        belt.setParams(new HashMap<>(java.util.Map.of("beltSpeed", 3.0, "beltLength", 4.0)));
        belt.getProperties().setFriction(0.2);
        PhysicsElement block = el("blk", "cube", 0, 0.66);
        Scene sc = new Scene();
        sc.setElements(List.of(belt, block));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        var r = validator.validate(sc);
        assertTrue(r.isValid(), "合法传送带场景应通过: " + r.getErrors());
    }
}
