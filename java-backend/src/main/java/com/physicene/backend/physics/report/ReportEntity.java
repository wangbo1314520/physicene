package com.physicene.backend.physics.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 实验报告（report 表）。B0 预埋：record_id 可空 + session_id 挂接实验会话；
 * 第六周主线补全生成/导出/乐观锁编辑时复用本实体。
 */
@Data
@Entity
@Table(name = "report")
public class ReportEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 仿真记录挂接（第六周，与 session 二选一） */
    @Column(name = "record_id")
    private Long recordId;

    /** 实验会话挂接（实验库 B0 预埋） */
    @Column(name = "session_id")
    private Long sessionId;

    /** 报告内容 JSON（实验提交：{experimentType, sessionId, 章节, 数据摘要, 结论, AI反馈}） */
    @Column(columnDefinition = "json")
    private String content;

    @Column(name = "export_path", length = 255)
    private String exportPath;

    @Column(nullable = false)
    private Integer version = 1;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
