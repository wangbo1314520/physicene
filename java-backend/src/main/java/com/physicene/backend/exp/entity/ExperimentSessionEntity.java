package com.physicene.backend.exp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 实验会话（实验库 B0 数据持久化核心表）：
 * 步骤状态机快照 / 原始数据 / 处理数据 / 结论 / AI 反馈 / 乐观锁多端同步。
 * status: draft=进行中（自动保存草稿，断点续做），submitted=已提交（锁定并挂 Report）。
 */
@Data
@Entity
@Table(name = "experiment_session")
public class ExperimentSessionEntity {

    public enum Status {DRAFT, SUBMITTED}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "experiment_id", nullable = false, length = 64)
    private String experimentId;

    @Convert(converter = com.physicene.backend.common.jpa.SessionStatusConverter.class)
    @Column(nullable = false, length = 12)
    private Status status = Status.DRAFT;

    /** 步骤状态机快照 JSON：{current, completed[], records{}, mode} */
    @Column(name = "step_state", columnDefinition = "json")
    private String stepState;

    /** 原始读数 JSON */
    @Column(name = "raw_data", columnDefinition = "json")
    private String rawData;

    /** 处理数据 JSON（描点/拟合/图像配置，B1 起填充） */
    @Column(name = "processed_data", columnDefinition = "json")
    private String processedData;

    @Column(columnDefinition = "text")
    private String conclusion;

    @Column(name = "ai_feedback", columnDefinition = "text")
    private String aiFeedback;

    /** JPA 乐观锁（并发保存 409，多端同步依据） */
    @Version
    private Integer version;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
