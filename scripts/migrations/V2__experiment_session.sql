-- =====================================================
-- 迁移 V2：实验库 B0（experiment/journal 2026-09-14）
-- 1) 新建 experiment_session（实验会话：步骤状态/原始数据/处理数据/AI反馈/乐观锁）
-- 2) report 表扩展：record_id 允许 NULL + 新增 session_id（实验提交挂接 Report 预埋）
-- 前置：V1 = scripts/init-db.sql（13 表）
-- =====================================================
USE physicene;

-- 1. 实验会话表
CREATE TABLE IF NOT EXISTS experiment_session (
    id              BIGINT      NOT NULL AUTO_INCREMENT,
    student_id      BIGINT      NOT NULL,
    experiment_id   VARCHAR(64) NOT NULL COMMENT '实验注册键，如 em-coulomb-repulsion',
    status          ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
    step_state      JSON        NULL COMMENT '步骤状态机快照 {current,completed[],records{},mode}',
    raw_data        JSON        NULL COMMENT '原始读数（表格行/纸带点/极值采集）',
    processed_data  JSON        NULL COMMENT '处理数据（描点/拟合/图像配置）',
    conclusion      TEXT        NULL COMMENT '学生结论',
    ai_feedback     TEXT        NULL COMMENT 'AI 助教反馈（B7 回填）',
    version         INT         NOT NULL DEFAULT 1 COMMENT '乐观锁·多端同步',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_student_exp (student_id, experiment_id),
    KEY idx_student_status (student_id, status),
    KEY idx_exp_status (experiment_id, status),
    KEY idx_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. report 表扩展（Report 预埋：实验提交可挂接；record_id 变可空）
ALTER TABLE report MODIFY record_id BIGINT NULL;
ALTER TABLE report ADD COLUMN session_id BIGINT NULL COMMENT '实验会话挂接（B0 预埋）' AFTER record_id;
ALTER TABLE report ADD KEY idx_session_id (session_id);
