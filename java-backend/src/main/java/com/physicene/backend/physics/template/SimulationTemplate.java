package com.physicene.backend.physics.template;

import com.physicene.backend.physics.model.Scene;

/**
 * 预设模板（SRS F2.1/F2.3，原三种模拟降级为"快速开始"入口）。
 * 加新模板 = 新增一个实现类（Spring 自动收集进 TemplateRegistry，"只加不改"）。
 */
public interface SimulationTemplate {

    /** 模板类型标识，如 template_collision */
    String getType();

    /** 展示名 */
    String getDisplayName();

    String getDescription();

    /** 模板初始场景（深拷贝由 SceneService 负责派生，模板本身只读） */
    Scene initialScene();
}
