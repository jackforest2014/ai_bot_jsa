-- 用户偏好（长期记忆结构化落库）
ALTER TABLE users ADD COLUMN preferences_json TEXT;

-- 任务子任务/结构化详情
ALTER TABLE tasks ADD COLUMN detail_json TEXT;

-- 工作空间路径与标签
ALTER TABLE file_uploads ADD COLUMN folder_path TEXT NOT NULL DEFAULT '';
ALTER TABLE file_uploads ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_files_user_folder ON file_uploads(user_id, folder_path);

-- Serper 按用户按日计数
CREATE TABLE IF NOT EXISTS serper_usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
