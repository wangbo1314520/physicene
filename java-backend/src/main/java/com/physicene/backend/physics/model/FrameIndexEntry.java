package com.physicene.backend.physics.model;

/** 帧全局索引项（SRS F2.9 契约类名 FrameIndex，为避免与字段名混淆命名为 FrameIndexEntry）。 */
public record FrameIndexEntry(int frameOffset, double t) {
}
