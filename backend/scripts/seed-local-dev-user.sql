-- 本地 D1 开发用户：登录页可粘贴令牌 local-dev-user（与 Bearer 一致）
-- 执行：npm run db:seed:dev-user（或 wrangler d1 execute ... --file=...）
INSERT OR IGNORE INTO users (id, name, email, ai_nickname, created_at)
VALUES (
  'local-dev-user',
  '本地开发',
  'dev@example.local',
  '助手',
  CAST(strftime('%s', 'now') AS INTEGER)
);

-- 迁移 0009 只为「当时已存在」的用户建会话；seed 后补一条，供 POST /api/chat/stream 使用
INSERT OR IGNORE INTO chat_sessions (id, user_id, title, title_source, created_at, updated_at)
VALUES (
  'sess-local-dev-user',
  'local-dev-user',
  '默认会话',
  'auto',
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
);
