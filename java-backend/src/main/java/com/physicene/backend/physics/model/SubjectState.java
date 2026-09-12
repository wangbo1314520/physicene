package com.physicene.backend.physics.model;

/** 运动主体状态（SRS F2.9：FullSnapshot.elements / KeySnapshot.subjects 的元素）。 */
public record SubjectState(String id, double x, double y, double vx, double vy, Double angle) {
}
