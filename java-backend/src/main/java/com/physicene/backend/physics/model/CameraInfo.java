package com.physicene.backend.physics.model;

import lombok.Data;

/** 摄像机信息（SRS F2.7）：物理 2D，2.5D 由前端 Three.js 消费。 */
@Data
public class CameraInfo {

    private double cameraX = 0;

    private double cameraY = 0;

    /** 3D 视角 Z 高度 */
    private double cameraZ = 14;

    /** 俯仰角，默认 45°（isometric 2.5D） */
    private double cameraAngle = 45;

    private boolean followMode = false;

    /** "isometric"（默认 2.5D）| "top_down"（纯 2D） */
    private String viewMode = "isometric";
}
