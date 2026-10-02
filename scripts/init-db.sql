-- 【已退役 2026-10-02（P6 Flyway）】本文件不再用于建库——权威 schema/种子移至
-- java-backend/src/main/resources/db/migration/（V1 基线=本文件同名 14 表快照、V2=种子）。
-- 新部署：直接启动后端（JDBC createDatabaseIfNotExist + Flyway 自动迁移）；演进：加 V3__xxx.sql。
-- 保留本文件作历史参照（P5a 批1 手动 DDL 次生事故的物证）。
-- =====================================================
-- PhysiScene 数据库初始化（SRS v3.4.1 §5.2 / 数据库设计 ER+DDL）
-- 13 张表：user / experiment_scenario / experiment_record / report /
--          student_profile / conversation / message / teaching_strategy /
--          token_usage / system_token_usage / operation_log / audit_log / ocr_type_mapping
-- 知识库 KnowledgeChunk 由 Chroma 管理，不入 MySQL。
-- =====================================================

CREATE DATABASE IF NOT EXISTS physicene
    DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE physicene;

-- 1. 用户
CREATE TABLE IF NOT EXISTS user (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    username        VARCHAR(50)     NOT NULL,
    password_hash   VARCHAR(100)    NOT NULL,
    role            ENUM('student','teacher','admin') NOT NULL,
    name            VARCHAR(50)     NOT NULL,
    class_id        BIGINT          NULL COMMENT '预留：v2 加班级',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username),
    KEY idx_role (role),
    KEY idx_class_id (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 实验场景
CREATE TABLE IF NOT EXISTS experiment_scenario (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    type            VARCHAR(50)     NOT NULL COMMENT 'free_build/template_*',
    scene_data      JSON            NOT NULL COMMENT '{elements:[...], config:{...}}',
    source          ENUM('manual','ocr','template') NOT NULL,
    creator_id      BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_type (type),
    KEY idx_creator_id (creator_id),
    KEY idx_creator_type_created (creator_id, type, created_at DESC),
    CONSTRAINT fk_scenario_creator FOREIGN KEY (creator_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 实验记录
CREATE TABLE IF NOT EXISTS experiment_record (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    student_id      BIGINT          NOT NULL,
    scenario_id     BIGINT          NOT NULL,
    sim_id          VARCHAR(36)     NOT NULL COMMENT 'UUID',
    start_time      DATETIME        NOT NULL,
    end_time        DATETIME        NULL,
    sim_result      LONGTEXT        NULL COMMENT '完整 SimResult JSON（5-10MB）',
    status          ENUM('running','completed','failed') NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sim_id (sim_id),
    KEY idx_student_id (student_id),
    KEY idx_scenario_id (scenario_id),
    KEY idx_start_time (start_time DESC),
    CONSTRAINT fk_record_student FOREIGN KEY (student_id) REFERENCES user(id),
    CONSTRAINT fk_record_scenario FOREIGN KEY (scenario_id) REFERENCES experiment_scenario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 实验报告（1:1 记录，乐观锁）
CREATE TABLE IF NOT EXISTS report (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    record_id       BIGINT          NULL COMMENT '实验记录(第六周)或实验会话(见 session_id)二选一',
    session_id      BIGINT          NULL COMMENT '实验会话挂接（实验库 B0）',
    content         JSON            NULL COMMENT '6 章节',
    export_path     VARCHAR(255)    NULL,
    version         INT             NOT NULL DEFAULT 1 COMMENT '乐观锁',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_record_id (record_id),
    KEY idx_session_id (session_id),
    CONSTRAINT fk_report_record FOREIGN KEY (record_id) REFERENCES experiment_record(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 学生画像（1:1 用户）
CREATE TABLE IF NOT EXISTS student_profile (
    id                          BIGINT          NOT NULL AUTO_INCREMENT,
    student_id                  BIGINT          NOT NULL,
    knowledge_mastery           DECIMAL(3,2)    NOT NULL DEFAULT 0.50,
    operation_proficiency       DECIMAL(3,2)    NOT NULL DEFAULT 0.50,
    question_history_summary    TEXT            NULL,
    experiment_count            INT             NOT NULL DEFAULT 0,
    created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_student_id (student_id),
    CONSTRAINT fk_profile_student FOREIGN KEY (student_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 会话
CREATE TABLE IF NOT EXISTS conversation (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    student_id      BIGINT          NOT NULL,
    title           VARCHAR(100)    NULL,
    message_count   INT             NOT NULL DEFAULT 0 COMMENT '定时同步非实时',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_student_id (student_id),
    CONSTRAINT fk_conv_student FOREIGN KEY (student_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 消息
CREATE TABLE IF NOT EXISTS message (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT          NOT NULL,
    role            ENUM('user','assistant') NOT NULL,
    content         TEXT            NOT NULL,
    token_usage     INT             NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_conversation_id (conversation_id),
    KEY idx_created_at (created_at),
    CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversation(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. 教师策略（一教师一条全局策略）
CREATE TABLE IF NOT EXISTS teaching_strategy (
    id                      BIGINT          NOT NULL AUTO_INCREMENT,
    teacher_id              BIGINT          NOT NULL,
    scope_type              ENUM('global','class') NOT NULL DEFAULT 'global',
    scope_id                BIGINT          NULL COMMENT 'v2 加班级后启用',
    focus_topics            JSON            NULL,
    explanation_level       ENUM('brief','standard','detailed') NOT NULL DEFAULT 'standard',
    challenge_intensity     ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
    threshold_config        JSON            NULL COMMENT '{"knowledgeHigh":0.7,"knowledgeLow":0.3,"proficiencyHigh":0.7,"proficiencyLow":0.3}',
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_teacher_scope (teacher_id, scope_type),
    CONSTRAINT fk_strategy_teacher FOREIGN KEY (teacher_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. 用户 Token 用量（按日）
CREATE TABLE IF NOT EXISTS token_usage (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    user_id             BIGINT      NOT NULL,
    date                DATE        NOT NULL,
    prompt_tokens       INT         NOT NULL DEFAULT 0,
    completion_tokens   INT         NOT NULL DEFAULT 0,
    total_tokens        INT         NOT NULL DEFAULT 0,
    created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_date (user_id, date),
    CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. 系统 Token 账户（失败会话）
CREATE TABLE IF NOT EXISTS system_token_usage (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    date                DATE        NOT NULL,
    prompt_tokens       INT         NOT NULL DEFAULT 0,
    completion_tokens   INT         NOT NULL DEFAULT 0,
    total_tokens        INT         NOT NULL DEFAULT 0,
    reason              VARCHAR(50) NULL COMMENT '失败原因分类',
    created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. 操作日志（级联删除）
CREATE TABLE IF NOT EXISTS operation_log (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    record_id       BIGINT          NULL COMMENT '实验记录(第六周)或实验会话(见 session_id)二选一',
    session_id      BIGINT          NULL COMMENT '实验会话挂接（实验库 B0）',
    action          ENUM('start','pause','step','param_change','screenshot','export','report_generate') NOT NULL,
    action_detail   JSON            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_record_id (record_id),
    KEY idx_created_at (created_at),
    CONSTRAINT fk_oplog_record FOREIGN KEY (record_id) REFERENCES experiment_record(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. 审计日志（不设外键：审计不随用户删除；保留 180 天）
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    actor_id        BIGINT          NULL,
    action          VARCHAR(50)     NOT NULL,
    target_type     VARCHAR(50)     NULL,
    target_id       VARCHAR(64)     NULL,
    timestamp       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip              VARCHAR(45)     NULL,
    PRIMARY KEY (id),
    KEY idx_actor_id (actor_id),
    KEY idx_target (target_type, target_id),
    KEY idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. 实验会话（实验库 B0：步骤状态/原始数据/处理数据/AI反馈/乐观锁）
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

-- 13. OCR 题型映射（admin 维护）
CREATE TABLE IF NOT EXISTS ocr_type_mapping (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    keyword         VARCHAR(50)     NOT NULL,
    sim_type        VARCHAR(50)     NOT NULL,
    priority        INT             NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_keyword (keyword),
    KEY idx_sim_type (sim_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始数据：OCR 关键词映射 + 首个 admin（密码 hash 需替换为真实 BCrypt 值）
INSERT INTO ocr_type_mapping (keyword, sim_type, priority) VALUES
    ('小车',   'template_collision', 10),
    ('碰撞',   'template_collision', 10),
    ('动量',   'template_collision',  8),
    ('斜抛',   'template_projectile', 10),
    ('平抛',   'template_projectile',  9),
    ('抛体',   'template_projectile',  8);

-- admin 账号：用户名 admin，初始密码 admin123（BCrypt cost=10）
-- 首次部署后请立即修改密码
INSERT INTO user (username, password_hash, role, name) VALUES
    ('admin', '$2b$10$JG3iwZMTGXvSCZuuCSiNqujQ6Dx9YlUCgUtyfNw2BPUqNOAH/JYai', 'admin', '系统管理员');
