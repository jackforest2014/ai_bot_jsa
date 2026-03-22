import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 与迁移 0009 后一致：name 唯一、email 可空 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  email: text('email').unique(),
  ai_nickname: text('ai_nickname').notNull().default('助手'),
  created_at: integer('created_at').notNull(),
  preferences_json: text('preferences_json'),
});

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  title_source: text('title_source').notNull().default('auto'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  created_at: integer('created_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  project_id: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  detail_json: text('detail_json'),
  status: text('status').notNull().default('pending'),
  /** Unix 秒；语义为 Asia/Shanghai 墙钟时刻的瞬时点 */
  starts_at: integer('starts_at'),
  ends_at: integer('ends_at'),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
});

export const promptTemplates = sqliteTable('prompt_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  template_text: text('template_text').notNull(),
  scenario: text('scenario').notNull(),
  created_at: integer('created_at').notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  session_id: text('session_id')
    .notNull()
    .references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  intention: text('intention'),
  prompt_id: text('prompt_id').references(() => promptTemplates.id, { onDelete: 'set null' }),
  keywords: text('keywords'),
  conversation_id: text('conversation_id'),
  created_at: integer('created_at').notNull(),
});

/** processed: 0 未/处理中，1 已向量化，-1 失败 */
export const fileUploads = sqliteTable('file_uploads', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  original_name: text('original_name').notNull(),
  mime_type: text('mime_type').notNull(),
  size: integer('size').notNull(),
  r2_key: text('r2_key').notNull(),
  semantic_type: text('semantic_type'),
  folder_path: text('folder_path').notNull().default(''),
  tags: text('tags'),
  processed: integer('processed').notNull().default(0),
  /** 索引失败时的简短说明（成功或非失败态应为空） */
  process_error: text('process_error'),
  created_at: integer('created_at').notNull(),
});

export const serperUsage = sqliteTable(
  'serper_usage',
  {
    user_id: text('user_id').notNull(),
    day: text('day').notNull(),
    call_count: integer('call_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day] })],
);

/** 每次工具执行一条，便于按时间区间统计（迁移 0012） */
export const toolInvocations = sqliteTable('tool_invocations', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  session_id: text('session_id'),
  tool_name: text('tool_name').notNull(),
  ok: integer('ok').notNull(),
  error_message: text('error_message'),
  duration_ms: integer('duration_ms').notNull(),
  created_at: integer('created_at').notNull(),
});
