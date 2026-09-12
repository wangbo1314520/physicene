package com.physicene.backend.physics.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 关键事件（SRS F2.9：collision / max_height / landing / launch / stop）。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class KeyEvent {

    private double t;

    private String type;

    /** 前端显示文本，如 "碰撞瞬间" */
    private String label;

    /** 对应帧全局序号（回放定位） */
    private Integer frameIndex;
}
