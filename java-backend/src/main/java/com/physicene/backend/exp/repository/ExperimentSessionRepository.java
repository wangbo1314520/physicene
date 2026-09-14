package com.physicene.backend.exp.repository;

import com.physicene.backend.exp.entity.ExperimentSessionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExperimentSessionRepository extends JpaRepository<ExperimentSessionEntity, Long> {

    /** 断点续做：该学生该实验最近的草稿 */
    ExperimentSessionEntity findFirstByStudentIdAndExperimentIdAndStatusOrderByIdDesc(
            Long studentId, String experimentId, ExperimentSessionEntity.Status status);

    Page<ExperimentSessionEntity> findByStudentId(Long studentId, Pageable pageable);

    Page<ExperimentSessionEntity> findByStudentIdAndStatus(Long studentId,
                                                           ExperimentSessionEntity.Status status, Pageable pageable);

    /** 教师统计：某实验全部会话（按状态聚合在服务层做） */
    Page<ExperimentSessionEntity> findByExperimentId(String experimentId, Pageable pageable);

    long countByExperimentIdAndStatus(String experimentId, ExperimentSessionEntity.Status status);
}
