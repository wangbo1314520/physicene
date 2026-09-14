-- =====================================================
-- 回滚 V2（experiment_session + report 扩展）
-- 警告：会删除所有实验会话数据；已挂 session 的 Report 行将被删除（record_id 不可空）
-- =====================================================
USE physicene;

-- 先删挂接实验会话的 Report 行（回滚后 record_id 不可空）
DELETE FROM report WHERE session_id IS NOT NULL;

ALTER TABLE report DROP KEY idx_session_id;
ALTER TABLE report DROP COLUMN session_id;
ALTER TABLE report MODIFY record_id BIGINT NOT NULL;

DROP TABLE IF EXISTS experiment_session;
