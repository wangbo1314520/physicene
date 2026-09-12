package com.physicene.backend.physics.model;

import lombok.Data;

/** 元件物性（SRS F2.0）。bField/bDirection 为 V1.5 电磁元件预留，力学元件保持 null。 */
@Data
public class PhysicalProperties {

    /** 质量 kg，L2 约束 (0, 1e6) */
    private double mass = 1.0;

    /** 摩擦系数 [0,1] */
    private double friction = 0.0;

    /** 弹性恢复系数 [0,1]，e=1 完全弹性碰撞 */
    private double restitution = 0.5;

    /** 电荷量 C（V1.5） */
    private double charge = 0.0;

    /** 磁感应强度 T（V1.5，magnet 专用） */
    private Double bField = null;

    /** 磁场方向 "out"/"in"（V1.5，magnet 专用） */
    private String bDirection = null;
}
