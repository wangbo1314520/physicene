package com.physicene.backend.physics.model;

import lombok.Data;

/** 混合存储帧（SRS F2.7）：snapshot 按 snapshotType 反序列化为 FullSnapshot/KeySnapshot。 */
@Data
public class Frame {

    private double t;

    private Object snapshot;

    /** "full" | "key" */
    private String snapshotType;

    public Frame() {
    }

    public Frame(double t, Object snapshot, String snapshotType) {
        this.t = t;
        this.snapshot = snapshot;
        this.snapshotType = snapshotType;
    }
}
