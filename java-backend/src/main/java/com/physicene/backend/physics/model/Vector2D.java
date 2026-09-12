package com.physicene.backend.physics.model;

/** 二维向量（SRS F2.0）。物理引擎 2D：x 向右，y 向上，重力朝下为负 y。 */
public record Vector2D(double x, double y) {

    public static final Vector2D ZERO = new Vector2D(0, 0);

    public Vector2D {
    }

    public double magnitude() {
        return Math.hypot(x, y);
    }
}
