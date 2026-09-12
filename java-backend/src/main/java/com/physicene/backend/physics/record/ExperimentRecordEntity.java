package com.physicene.backend.physics.record;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDateTime;

/** 实验记录表（SRS §5.2 experiment_record，sim_result 存完整 JSON）。 */
@Data
@Entity
@Table(name = "experiment_record")
public class ExperimentRecordEntity {

    public enum Status {RUNNING, COMPLETED, FAILED}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "scenario_id", nullable = false)
    private Long scenarioId;

    @Column(name = "sim_id", nullable = false, length = 36, unique = true)
    private String simId;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime = LocalDateTime.now();

    @Column(name = "end_time")
    private LocalDateTime endTime;

    @Column(name = "sim_result", columnDefinition = "longtext")
    private String simResult;

    @Convert(converter = com.physicene.backend.common.jpa.StatusConverter.class)
    @Column(nullable = false, length = 12)
    private Status status = Status.RUNNING;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
