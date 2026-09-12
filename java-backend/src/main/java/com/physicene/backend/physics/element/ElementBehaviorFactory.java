package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;

/**
 * 元件行为工厂（SRS F2.6）。
 * 实现为 Spring @Component：ElementRegistry 构造时自动收集全部工厂 bean 完成注册，
 * 满足"加新元件只加不改"（新工厂类被组件扫描捕获，引擎零修改）。
 */
public interface ElementBehaviorFactory {

    /** 该工厂能创建的元件类型 */
    String type();

    /** 由元件数据创建行为实例 */
    ElementBehavior create(PhysicsElement element);
}
