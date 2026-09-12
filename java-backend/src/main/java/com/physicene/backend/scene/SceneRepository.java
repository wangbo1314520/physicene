package com.physicene.backend.scene;

import com.physicene.backend.scene.model.ExperimentScenarioEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SceneRepository extends JpaRepository<ExperimentScenarioEntity, Long> {

    /** 归属校验（SD-1 checkOwnership：非本人 1003） */
    boolean existsByIdAndCreatorId(Long id, Long creatorId);

    Page<ExperimentScenarioEntity> findByCreatorId(Long creatorId, Pageable pageable);
}
