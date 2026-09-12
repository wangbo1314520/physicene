package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.world.World;

/**
 * 元件行为接口（SRS F2.6）：描述元件"怎么动"，与数据类 PhysicsElement（"是什么"）职责正交。
 * 加新元件 = 新写一个实现类 + 一个 Factory（Spring 自动装配进 ElementRegistry），不改既有代码。
 */
public interface ElementBehavior {

    /** 元件类型标识，如 "cube" */
    String getType();

    /**
     * 依据元件数据（工厂创建时注入的 PhysicsElement）构建 dyn4j 刚体。
     * 契约注：SRS 原签名 createBody(World)，实现把 World 传入以便注册碰撞体；
     * 元件参数经 Factory.create(PhysicsElement) 类型安全注入，替代 Map 透传。
     */
    Body createBody(World<Body> world);

    /** 每步自定义力（如 V1.5 洛伦兹力 F=qv×B）；力学元件返回 null 走引擎默认 */
    default Vector2D computeForce(ElementContext ctx) {
        return null;
    }

    /** 每步状态更新钩子（如受控元件改颜色状态等）；默认无操作 */
    default void updateState(Body body, double dt) {
    }
}
