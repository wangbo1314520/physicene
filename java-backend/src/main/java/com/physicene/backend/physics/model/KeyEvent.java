package com.physicene.backend.physics.model;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/** 关键事件（SRS F2.9 + 统一搭建台扩展）。
 *  既有类型：collision / max_height / landing / launch / stop
 *  阶段一新增：land_surface / leave_surface / detach / apex_pass / common_speed /
 *              belt_common_speed / rope_taut / rope_slack / spring_natural
 *  payload：事件数值（detach→theta 角、common_speed→v、belt_common_speed→v 等） */
@Data
@NoArgsConstructor
public class KeyEvent {

    private double t;

    private String type;

    /** 前端显示文本，如 "碰撞瞬间" */
    private String label;

    /** 对应帧全局序号（回放定位） */
    private Integer frameIndex;

    /** 数值载荷（可空；旧记录无此字段按 null 反序列化） */
    private Map<String, Object> payload;

    public KeyEvent(double t, String type, String label, Integer frameIndex) {
        this.t = t;
        this.type = type;
        this.label = label;
        this.frameIndex = frameIndex;
    }

    public KeyEvent(double t, String type, String label, Integer frameIndex, Map<String, Object> payload) {
        this(t, type, label, frameIndex);
        this.payload = payload;
    }
}
