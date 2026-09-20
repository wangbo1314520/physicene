package com.physicene.backend.physics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.physicene.backend.physics.element.*;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.KeyEvent;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * D5 防护三件套（第二十七轮）：
 * ① Super 契约锁定（RodElement NPE 教训制度化——重构被继承类必须 grep 子类，本测试锁死契约让破坏当场红）
 * ② KeyEvent payload 放宽（Map&lt;String,Object&gt;）后的 Jackson 序列化边界
 * ③ rope_break 事件 payload 形状（ropeId 字符串 + 数值字段——spring_break 等未来事件照此模板）
 */
class D5GuardTest {

    /** ① 父类契约：RopeElement（冲量式）createJoint 返回 null；子类 RodElement 自建 DistanceJoint 非空 */
    @Test
    void superContractLocked() {
        World<Body> world = new World<>();
        Map<String, Body> bodies = new HashMap<>();
        PhysicsElement blk = new PhysicsElement();
        blk.setId("b1"); blk.setType("cube"); blk.setPosition(new Vector2D(0, 0));
        blk.getProperties().setMass(1);
        Body body = new Body();
        body.addFixture(new org.dyn4j.geometry.Rectangle(1, 1));
        body.setMass(org.dyn4j.geometry.MassType.NORMAL);
        world.addBody(body);
        bodies.put("b1", body);

        PhysicsElement rd = new PhysicsElement();
        rd.setId("r1"); rd.setType("rope"); rd.setPosition(new Vector2D(0, 2));
        rd.setConnectTo("b1"); rd.setAnchorA(new Vector2D(0, 0.5));
        rd.getParams().put("jointLength", 2.0);
        RopeElement rope = new RopeElement(rd);
        Joint<Body> rj = rope.createJoint(world, bodies);
        assertNull(rj, "RopeElement 冲量式契约：createJoint 返回 null（子类不得假设非 null——D5 NPE 教训）");

        PhysicsElement od = new PhysicsElement();
        od.setId("d1"); od.setType("rod"); od.setPosition(new Vector2D(0, 2));
        od.setConnectTo("b1"); od.setAnchorA(new Vector2D(0, 0.5));
        od.getParams().put("jointLength", 2.0);
        RodElement rod = new RodElement(od);
        Joint<Body> dj = rod.createJoint(world, bodies);
        assertNotNull(dj, "RodElement 契约：自建 DistanceJoint 非空（父类只备体）");
        assertInstanceOf(DistanceJoint.class, dj);
    }

    /** ② payload 混合类型（String/Double/Integer/null）Jackson 序列化形状 */
    @Test
    void payloadMixedTypeSerialization() throws Exception {
        Map<String, Object> payload = new HashMap<>();
        payload.put("ropeId", "rope-7");
        payload.put("tension", 12.76);
        payload.put("count", 3);
        payload.put("note", null);
        KeyEvent ev = new KeyEvent(1.25, "rope_break", "绳断裂", 75, payload);
        String json = new ObjectMapper().writeValueAsString(ev);
        assertTrue(json.contains("\"ropeId\":\"rope-7\""), "字符串序列化: " + json);
        assertTrue(json.contains("\"tension\":12.76"), "Double 序列化: " + json);
        assertTrue(json.contains("\"count\":3"), "Integer 序列化（无小数点）: " + json);
        assertTrue(json.contains("\"type\":\"rope_break\""), "type 纯净枚举（Java 字段 type；WS 广播层映射为前端 eventType）: " + json);
        // 反序列化回读（WS 双向）
        KeyEvent back = new ObjectMapper().readValue(json, KeyEvent.class);
        assertEquals("rope-7", back.getPayload().get("ropeId"));
        assertEquals(12.76, (Double) back.getPayload().get("tension"), 1e-9);
        assertEquals(3, ((Number) back.getPayload().get("count")).intValue());
    }

    /** ③ rope_break 事件端到端形状：type 纯净 + payload{ropeId 字符串, tension/tmax 数值}——未来事件模板 */
    @Test
    void ropeBreakEventShapeEndToEnd() {
        ElementRegistry registry = new ElementRegistry(List.of(
                new CubeElementFactory(), new RopeElementFactory()));
        PhysicsElement blk = new PhysicsElement();
        blk.setId("blk"); blk.setType("cube"); blk.setPosition(new Vector2D(0, -0.055));
        blk.getProperties().setMass(2); blk.getProperties().setFriction(0);
        blk.getParams().put("fixRot", 1.0);
        PhysicsElement r1 = new PhysicsElement();
        r1.setId("rope-A"); r1.setType("rope"); r1.setPosition(new Vector2D(-0.8, 1.2));
        r1.setConnectTo("blk"); r1.setAnchorA(new Vector2D(0, 0.5));
        r1.getParams().put("jointLength", 1.1);
        r1.getParams().put("tMax", 10.0);
        PhysicsElement r2 = new PhysicsElement();
        r2.setId("rope-B"); r2.setType("rope"); r2.setPosition(new Vector2D(0.8, 1.2));
        r2.setConnectTo("blk"); r2.setAnchorA(new Vector2D(0, 0.5));
        r2.getParams().put("jointLength", 1.1);
        r2.getParams().put("tMax", 10.0);
        Scene sc = new Scene();
        sc.setElements(List.of(blk, r1, r2));
        SimulationConfig cfg = new SimulationConfig();
        cfg.setMaxDuration(1.0);
        cfg.setSubsteps(4);
        sc.setConfig(cfg);
        SimulationInstance in = new SimulationInstance("t-guard-shape", sc, registry);
        in.runToEndSync();
        List<KeyEvent> breaks = in.getKeyEvents().stream()
                .filter(e -> "rope_break".equals(e.getType())).toList();
        assertTrue(breaks.size() >= 1, "应对称双断（T=14.28 > Tmax=10）");
        for (KeyEvent e : breaks) {
            assertEquals("rope_break", e.getType(), "type 纯净（无 id 后缀）");
            Object id = e.getPayload().get("ropeId");
            assertTrue(id instanceof String && ((String) id).startsWith("rope-"), "ropeId 字符串入 payload");
            assertTrue(((Number) e.getPayload().get("tension")).doubleValue() > 10.0, "tension 数值超阈");
            assertEquals(10.0, ((Number) e.getPayload().get("tmax")).doubleValue(), 1e-9);
        }
    }
}
