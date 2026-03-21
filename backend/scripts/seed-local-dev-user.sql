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
