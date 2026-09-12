package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import lombok.Data;

import java.util.List;
import java.util.Map;

/** 力计算上下文（SRS F2.9）：computeForce 的只读输入，禁止在回调中修改。 */
@Data
public class ElementContext {

    private final List<PhysicsElement> allElements;

    private final Map<String, Vector2D> positionMap;

    private final Map<String, Vector2D> velocityMap;

    private final double currentTime;

    private final Vector2D gravity;
}
