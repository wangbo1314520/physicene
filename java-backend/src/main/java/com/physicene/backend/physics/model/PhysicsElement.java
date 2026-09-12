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
}
