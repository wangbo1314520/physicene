package com.physicene.backend.scene.model;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDateTime;

/** 实验场景表（SRS §5.2 experiment_scenario，scene_data 为 JSON 列）。 */
@Data
@Entity
@Table(name = "experiment_scenario")
public class ExperimentScenarioEntity {

    public enum Source {MANUAL, OCR, TEMPLATE}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** free_build / template_collision / template_projectile */
    @Column(nullable = false, length = 50)
    private String type;

    /** {"elements":[...], "config":{...}} */
    @Column(name = "scene_data", nullable = false, columnDefinition = "json")
    private String sceneData;

    @Convert(converter = com.physicene.backend.common.jpa.SourceConverter.class)
    @Column(nullable = false, length = 10)
    private Source source;

    @Column(name = "creator_id", nullable = false)
    private Long creatorId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
