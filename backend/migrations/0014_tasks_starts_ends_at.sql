-- 任务起止时间（Unix 秒；展示按 Asia/Shanghai 解释）
ALTER TABLE tasks ADD COLUMN starts_at INTEGER;
ALTER TABLE tasks ADD COLUMN ends_at INTEGER;
