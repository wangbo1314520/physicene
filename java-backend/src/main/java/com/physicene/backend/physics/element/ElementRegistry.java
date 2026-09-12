package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 元件注册表（SRS F2.6）：type → Factory。
 * Spring 构造注入所有 ElementBehaviorFactory bean；新增元件只需新增工厂类。
 */
@Component
public class ElementRegistry {

    private final Map<String, ElementBehaviorFactory> factories = new HashMap<>();

    public ElementRegistry(List<ElementBehaviorFactory> factoryBeans) {
        for (ElementBehaviorFactory factory : factoryBeans) {
            ElementBehaviorFactory prev = factories.put(factory.type(), factory);
            if (prev != null) {
                throw new IllegalStateException("元件类型重复注册: " + factory.type());
            }
        }
    }

    public ElementBehavior create(PhysicsElement element) {
        ElementBehaviorFactory factory = factories.get(element.getType());
        if (factory == null) {
            throw new IllegalArgumentException("未知元件类型: " + element.getType()
                    + "，支持: " + factories.keySet());
        }
        return factory.create(element);
    }

    public Set<String> supportedTypes() {
        return factories.keySet();
    }

    public boolean supports(String type) {
        return factories.containsKey(type);
    }
}
