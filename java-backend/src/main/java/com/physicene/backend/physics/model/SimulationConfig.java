package com.physicene.backend.physics.model;

import lombok.Data;

/** 全局仿真配置（SRS F2.0，默认值即契约默认值）。 */
@Data
public class SimulationConfig {

    /** 重力向量（默认朝下 9.8 m/s²） */
    private Vector2D gravity = new Vector2D(0, -9.8);

    /** 物理步长 s */
    private double timestep = 1.0 / 60.0;

    /** 最大帧数（30s × 60fps） */
    private int maxFrames = 1800;

    /** 最大时长 s */
    private double maxDuration = 30.0;

    /** 全部静止超时 s（F2.8 停止条件） */
    private double stillThreshold = 2.0;

    /** 空气阻力开关（关闭时 dragCoeff 不生效，validate 时 L3 警告） */
    private boolean airResistance = false;

    /** 阻力系数（仅 airResistance=true 生效） */
    private double dragCoeff = 0.1;

    /** 每契约步内部子步数（1=1/60，2=1/120，4=1/240，8=1/480；统一搭建台新元件默认 4，方案 §3.4） */
    private int substeps = 4;
}
