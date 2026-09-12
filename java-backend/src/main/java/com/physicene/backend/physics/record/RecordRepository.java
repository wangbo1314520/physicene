package com.physicene.backend.physics.record;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecordRepository extends JpaRepository<ExperimentRecordEntity, Long> {

    boolean existsByIdAndStudentId(Long id, Long studentId);

    Page<ExperimentRecordEntity> findByStudentId(Long studentId, Pageable pageable);

    /** 删除场景时连带清理其实验记录（SRS 5.5：学生数据随场景删除） */
    void deleteByScenarioId(Long scenarioId);
}
