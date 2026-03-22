-- 工具调用审计：按时间区间统计次数等（created_at 为 Unix 秒）

CREATE TABLE IF NOT EXISTS tool_invocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  tool_name TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_created_at ON tool_invocations(created_at);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_tool_name ON tool_invocations(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_user_created ON tool_invocations(user_id, created_at);
