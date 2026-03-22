-- PRD v1.2 / 技术方案 v1.4：chat_sessions、conversations.session_id、users.name 唯一、email 可空
-- 说明：不执行 `ALTER TABLE conversations ADD COLUMN session_id`，避免列已存在时重复迁移失败（如曾应用过旧版 0009）。

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_source TEXT NOT NULL DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at);

INSERT INTO chat_sessions (id, user_id, title, title_source, created_at, updated_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-'
    || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
  u.id,
  '新对话',
  'auto',
  u.created_at,
  CAST(strftime('%s', 'now') AS INTEGER)
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM chat_sessions s WHERE s.user_id = u.id);

PRAGMA foreign_keys = OFF;

-- 清理可能来自上次失败执行的临时表
DROP TABLE IF EXISTS conversations__v14;

-- 不显式写 REFERENCES chat_sessions：部分 D1/迁移执行器在解析 CREATE 时会对 main.chat_sessions 报错
CREATE TABLE conversations__v14 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intention TEXT,
  prompt_id TEXT,
  keywords TEXT,
  conversation_id TEXT,
  created_at INTEGER NOT NULL
);

-- 一律用「该 user 下最早一条 chat_sessions」作为 session_id，避免依赖是否已有 session_id 列（与旧版 UPDATE 语义一致）
INSERT INTO conversations__v14 (
  id,
  user_id,
  session_id,
  role,
  content,
  intention,
  prompt_id,
  keywords,
  conversation_id,
  created_at
)
SELECT
  c.id,
  c.user_id,
  (
    SELECT s.id
    FROM chat_sessions s
    WHERE s.user_id = c.user_id
    ORDER BY s.created_at ASC
    LIMIT 1
  ),
  c.role,
  c.content,
  c.intention,
  c.prompt_id,
  c.keywords,
  c.conversation_id,
  c.created_at
FROM conversations c
WHERE (
  SELECT s.id
  FROM chat_sessions s
  WHERE s.user_id = c.user_id
  ORDER BY s.created_at ASC
  LIMIT 1
) IS NOT NULL;

DROP TABLE conversations;
ALTER TABLE conversations__v14 RENAME TO conversations;

CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_session_created ON conversations(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_intention ON conversations(intention);

DROP TABLE IF EXISTS _chat_sessions_backup;
CREATE TABLE _chat_sessions_backup AS SELECT * FROM chat_sessions;
DROP TABLE chat_sessions;

DROP TABLE IF EXISTS users__v14;
CREATE TABLE users__v14 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  ai_nickname TEXT NOT NULL DEFAULT '助手',
  created_at INTEGER NOT NULL,
  preferences_json TEXT
);

INSERT INTO users__v14 (id, name, email, ai_nickname, created_at, preferences_json)
SELECT id, name, email, ai_nickname, created_at, preferences_json FROM users;

DROP TABLE users;
ALTER TABLE users__v14 RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_source TEXT NOT NULL DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO chat_sessions SELECT * FROM _chat_sessions_backup;
DROP TABLE _chat_sessions_backup;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at);

PRAGMA foreign_keys = ON;
