# AI 代理交互 (AI Proxy Demo) 开发任务列表

> 基于需求文档 `ai_proxy_demo.md` 与技术架构设计 `tech_design_ai_proxy_demo.md` 拆解。
> 后续所有的编码工作都将以此 Checklist 为向导推进进度。

## P0: 数据库迁移与 ORM 映射 (Database Migration)
- [x] **DB Schema 更新 (`backend/src/db/schema.ts`)**
  - [x] `users` 表：新增 `proxy_uuid: text('proxy_uuid').unique()`。
  - [x] `chatSessions` 表：新增 `proxy_for_user_id: text('proxy_for_user_id').references(() => users.id)`。
  - [x] `tasks` 表：新增 `session_id: text('session_id').references(() => chatSessions.id)`。
- [x] **生成并运行迁移 SQL**
  - [x] 创建 `0015_add_proxy_features.sql` 结构变更脚本。
  - [x] 将更新应用至 D1 数据库。

## P1: 核心 API 与服务接口开发 (Core API)
- [x] **代理文件上传 (`POST /api/proxy/upload`)**
  - [x] 复用现有大文件 R2 逻辑，强制设定入库 `folder_path = '人设'`。
  - [x] 文件上传成功后，生成8位数字字母混合的 `proxy_uuid` 并持久化到 `users` 表。
- [x] **访客初始化 (`GET /api/proxy/:uuid/info`)**
  - [x] 访客访问链接时，通过 `uuid` 解析对应的 User A，返回公开脱敏的设定信息（渲染打招呼和头像等）。
- [x] **会话构建路由改造 (`POST /api/sessions`)**
  - [x] 建立新 Session 时支持携带或读取 Proxy UUID 标识。
  - [x] 解析后将 User A ID 正确植入至生成的 `chatSessions` 记录的 `proxy_for_user_id` 中，保证双向所有权建立。
- [x] **访客收件箱 API (`GET /api/sessions/inbox`)**
  - [x] 按 `proxy_for_user_id` 查询 User A 名下所有访客会话并返回。

## P2: Agent 沙盒边界与执行能力隔离 (Agent Sandbox & Safety)
- [x] **RAG 与存储边界拦截 (`ChatService`)**
  - [x] 检测到代理会话时，强制将 RAG 检索范围限制为 `folder_path == '人设'`，防止主人知识库侧信道泄漏。
- [x] **代理 Agent Prompt 动态加载注入**
  - [x] `ChatService.handleMessage` 检测到代理会话时，抽取关联的最新"人设" Markdown 文本内容。
  - [x] 完整覆盖 System Prompt，以角色扮演形式回复访客。
- [x] **工具层沙盒限制 (`ChatService`)**
  - [x] 对于代理会话，只允许白名单工具（`search`、`add_task`、`list_tasks`、`confirm_tool_creation`、`resolve_shanghai_calendar`），禁用一切敏感操作。
- [x] **闭环任务工具封装 (`add_task` tool)**
  - [x] `add_task` 在执行时从 `ToolContext.sessionId` 提取 `session_id` 并写入 `tasks` 表。
  - [x] LLM 无法篡改该字段（字段由服务端注入，不在 LLM 可控参数列表中）。

## P3: 前端交互与客户端层 (Frontend / UI Integration)
- [x] **User A 设置管理页**
  - [x] 新增"专属代理分身"模块。
  - [x] 提供一键设定（传文件）、一键 Copy 代理链接 (`/ai_bot/{uuid}`) 以及更新人设文件等小功能。
- [x] **User A 侧边栏与收件箱**
  - [x] 新增左侧 Sidebar 入口 "访客收件箱"。
  - [x] 新增 `/inbox` 页面，展示 User A 名下所有访客代理会话，可一键跳转查看完整对话。
- [x] **User A 任务看板溯源优化**
  - [x] `taskRowToApi` 暴露 `session_id`，前端 `Task` 类型同步，任务卡片可据此渲染"追溯对话"链接。
- [x] **访客专用视图 (`/ai_bot/:uuid`)**
  - [x] 针对外部人员展示定制化干净聊天室（无需登录）。
  - [x] 隐藏所有侧边栏管理操作与复杂配置，仅保留聊天框与"重新开始"按钮。

## P4: 综合测试验证 (Verification & QA)
- [x] **主仆业务流功能贯通**
  - [x] TypeScript 类型检查 (backend `tsc --noEmit`)：零错误。
  - [x] 全套单元测试：100 个测试 Pass，1 个集成测试（需真实 API Key）按设计跳过。
  - [x] Mock 数据修复：所有测试文件中的 `UserRow` 和 `TaskRow` mock 是正确补充了 `proxy_uuid` 和 `session_id` 字段。
- [x] **SQL RAG 高强度防越权查阅安保测试（静态审查）**
  - [x] RAG 边界拦截：代理模式下 `targetUserId = proxyForUserId`，`folder_path='人设'`，严格限制访客只能触及主人的人设文件向量。
  - [x] 工具白名单：`proxyForUserId` 非空时道具过滤，`delete_task` 等破坏性工具被排除在外。
  - [x] `session_id` 安全注入：由服务端 `ToolContext.sessionId` 写入，LLM 参数列表中不包含该字段，无法被篹改。
  - [x] 收件笱 API 安全：`GET /api/sessions/inbox` 通过 `requireUserFromBearer` 身份验证，只返回当前登录用户作为 proxy owner 的会话，访客无法伪造。
