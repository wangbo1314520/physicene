package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.List;

/**
 * 完整帧快照（SRS F2.7/F2.9，最新 300 帧用）。
 * 力学场景字段：elements + kineticEnergy + momentum；电磁/抛体字段 V1.5/模板周扩展；
 * 无数据的字段整体省略（null 不序列化）。
 */
@Data
public class FullSnapshot {

    private List<SubjectState> elements;

    /** 总动能 J */
    private Double kineticEnergy;

    /** 总动量模 kg·m/s */
    private Double momentum;
}
