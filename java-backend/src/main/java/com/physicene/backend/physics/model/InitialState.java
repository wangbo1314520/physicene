package com.physicene.backend.physics.model;

import lombok.Data;

/** 初始运动状态（SRS F2.0，v3.1：v0/direction 归并为速度向量）。 */
@Data
public class InitialState {

    /** 初速度向量 m/s（含大小与方向） */
    private Vector2D velocity = Vector2D.ZERO;

    /** 初角速度 rad/s */
    private double angularVelocity = 0.0;
}
