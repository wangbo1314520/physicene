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

    // ===== 阶段二 frameV:2（方案 §3.10）：耦合通道按需发送，无通道场景字段缺省 =====

    /** 帧协议版本：1=纯力学（旧），2=多物理场（新，circuit/thermal/probes 按需） */
    private int frameV = 1;

    /** 电路通道：branchId → 电流 A（仅含电路元件的场景发送） */
    private java.util.Map<String, Double> circuit;

    /** 热学通道：cellId → [p, V, T]（仅含气室场景发送） */
    private java.util.Map<String, double[]> thermal;

    /** 探针通道：detectorId → [t, v]（光电门/传感器读数） */
    private java.util.Map<String, double[]> probes;
}
