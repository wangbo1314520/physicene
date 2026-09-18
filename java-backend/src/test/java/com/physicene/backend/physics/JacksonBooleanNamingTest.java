package com.physicene.backend.physics;

import com.physicene.backend.physics.model.CameraInfo;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.ValidationResult;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Jackson/Lombok 布尔命名契约（阶段三验收追问 1）：
 * Lombok 对 {@code boolean isXxx} 生成 {@code isXxx()/setXxx()}，Jackson 属性名因此是「去掉 is 前缀」的 xxx。
 * 前端 wire 契约必须发 fixed/visible（不是 isFixed/isVisible），否则被静默忽略。
 * 本测试锁定全部含布尔字段的 DTO 类的序列化键名 + 往返一致性——字段增删或命名漂移即红。
 */
class JacksonBooleanNamingTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void physicsElementBooleansSerializeAsFixedAndVisible() throws Exception {
        PhysicsElement e = new PhysicsElement();
        e.setId("e1");
        e.setFixed(true);
        e.setVisible(false);

        String json = mapper.writeValueAsString(e);
        assertTrue(json.contains("\"fixed\":true"), "isFixed 必须序列化为 fixed 键: " + json);
        assertTrue(json.contains("\"visible\":false"), "isVisible 必须序列化为 visible 键: " + json);
        assertFalse(json.contains("\"isFixed\""), "不得出现 isFixed 键: " + json);
        assertFalse(json.contains("\"isVisible\""), "不得出现 isVisible 键: " + json);

        // 反序列化往返
        PhysicsElement back = mapper.readValue(json, PhysicsElement.class);
        assertTrue(back.isFixed());
        assertFalse(back.isVisible());
    }

    @Test
    void physicsElementAcceptsCanonicalKeysAndIgnoresLegacyIsKeys() throws Exception {
        // 契约键（前端应发的）
        PhysicsElement ok = mapper.readValue("{\"id\":\"a\",\"fixed\":true,\"visible\":false}", PhysicsElement.class);
        assertTrue(ok.isFixed());
        assertFalse(ok.isVisible());
        // 旧键被静默忽略（Jackson 默认 FAIL_ON_UNKNOWN=false）——这正是坑的来源，此断言固化该语义
        PhysicsElement legacy = mapper.readValue("{\"id\":\"b\",\"isFixed\":true,\"isVisible\":false}", PhysicsElement.class);
        assertFalse(legacy.isFixed(), "isFixed 键必须被忽略（契约是 fixed）");
        assertTrue(legacy.isVisible());
    }

    @Test
    void nonIsPrefixedBooleansKeepTheirNames() throws Exception {
        // 无 is 前缀的布尔字段命名天然一致，锁定防回归
        SimulationConfig cfg = new SimulationConfig();
        cfg.setAirResistance(true);
        String json = mapper.writeValueAsString(cfg);
        assertTrue(json.contains("\"airResistance\":true"), json);

        ValidationResult v = new ValidationResult();
        v.setValid(false);
        String vJson = mapper.writeValueAsString(v);
        assertTrue(vJson.contains("\"valid\":false"), vJson);

        CameraInfo c = new CameraInfo();
        c.setFollowMode(true);
        String cJson = mapper.writeValueAsString(c);
        assertTrue(cJson.contains("\"followMode\":true"), cJson);
    }

    @Test
    void fullElementRoundTripKeepsEveryWireField() throws Exception {
        // 全字段往返：wire 上会出现的每个键在这里登记，新增可序列化字段时同步补行
        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("id", "rt1");
        wire.put("type", "belt");
        wire.put("position", Map.of("x", 1.0, "y", -2.0));
        wire.put("angle", 0.5);
        wire.put("scale", Map.of("x", 2.0, "y", 1.0));
        wire.put("fixed", true);
        wire.put("visible", true);
        wire.put("connectTo", "a");
        wire.put("connectTo2", "b");
        wire.put("anchorA", Map.of("x", 0.5, "y", 0.0));
        wire.put("anchorB", Map.of("x", -0.5, "y", 0.0));
        wire.put("params", Map.of("beltSpeed", 3.0, "beltLength", 8.0));
        PhysicsElement back = mapper.readValue(mapper.writeValueAsString(wire), PhysicsElement.class);
        assertEquals("rt1", back.getId());
        assertEquals("belt", back.getType());
        assertEquals(1.0, back.getPosition().x());
        assertEquals(-2.0, back.getPosition().y());
        assertEquals(0.5, back.getAngle());
        assertEquals(2.0, back.getScale().x());
        assertTrue(back.isFixed());
        assertTrue(back.isVisible());
        assertEquals("a", back.getConnectTo());
        assertEquals("b", back.getConnectTo2());
        assertEquals(0.5, back.getAnchorA().x());
        assertEquals(-0.5, back.getAnchorB().x());
        assertEquals(3.0, back.getParams().get("beltSpeed"));
    }
}
