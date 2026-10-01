package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

/** photogate 检测器注册工厂（P6 提前批——2026-10-01 十轮追问3 落地）。 */
@Component
public class PhotogateFactory implements ElementBehaviorFactory {

    @Override
    public String type() {
        return "photogate";
    }

    @Override
    public ElementBehavior create(PhysicsElement element) {
        return new SensorElement(element);
    }
}
