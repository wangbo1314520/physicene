package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.List;

/** 轻量帧快照（SRS F2.9：旧帧用，仅位置+速度，保证体积小）。 */
@Data
public class KeySnapshot {

    private double t;

    private List<SubjectState> subjects;
}
