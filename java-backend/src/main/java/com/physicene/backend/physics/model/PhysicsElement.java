package com.physicene.backend.physics.model;

import lombok.Data;

/** 元件数据类（SRS F2.0：描述元件"是什么"；行为见 element/ElementBehavior）。 */
@Data
public class PhysicsElement {

    /** 元件唯一 id，如 "cube_001" */
    private String id;

    /** cube / sphere / slope / track / spring / wall（L1 白名单由 ElementSchema 维护） */
    private String type;

    private Vector2D position;

    /** 朝向角 rad */
    private double angle = 0.0;

    /** 相对基准尺寸的缩放倍数（基准尺寸由各 ElementBehavior 定义） */
    private Vector2D scale = new Vector2D(1, 1);

    private PhysicalProperties properties = new PhysicalProperties();

    private InitialState initialState = new InitialState();

    /** 是否固定（固定元件不受力不移动） */
    private boolean isFixed = false;

    private boolean isVisible = true;

    private String color = "#4A90D9";

    // ===== 统一几何搭建台扩展（阶段一，方案 §2.4/§3.3）=====

    /** 关节/耦合连接对象 id（rope/rod/spring 连 A，pulley 连施力端） */
    private String connectTo;

    /** 第二连接对象 id（rope/rod/spring 连 B；pulley 连负载端） */
    private String connectTo2;

    /** 关节在 connectTo 本体上的局部锚点（米；null 视为 (0,0)） */
    private Vector2D anchorA;

    /** 关节在 connectTo2 本体上的局部锚点（米；null 视为 (0,0)） */
    private Vector2D anchorB;

    /**
     * 类型参数表（与前端 GeoElement.params 同构）：
     * belt: beltSpeed(-8..8 m/s), beltLength, beltRadius
     * loop_track: radius(0.1..5), arcA0<arcA1(°), arcSide(inner|outer|both), arcThickness
     * rope/rod: jointLength(>0)
     * spring: jointLength, stiffness(>0), dampingRatio(0..1)
     * pulley: ratio(1|2)
     * 任意 body: bullet(0|1)
     */
    private java.util.Map<String, Double> params = new java.util.HashMap<>();
}
