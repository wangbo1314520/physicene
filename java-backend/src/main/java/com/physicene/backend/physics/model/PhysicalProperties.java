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

    /** 磁感应强度 T（V1.5，b_field 区域元件用） */
    private Double bField = null;

    /** 磁场方向 "out"（垂直纸面向外）/"in"（向内） */
    private String bDirection = null;

    /** 匀强电场 X 分量 N/C（V1.5，e_field 区域元件用；教学量纲） */
    private Double eFieldX = null;

    /** 匀强电场 Y 分量 N/C */
    private Double eFieldY = null;
}
