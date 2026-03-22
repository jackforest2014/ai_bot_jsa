-- 异步索引失败原因（供前端展示；代码层仍用英文/结构化信息）
ALTER TABLE file_uploads ADD COLUMN process_error TEXT;
