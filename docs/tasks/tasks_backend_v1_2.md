## 项目开发任务列表（按时间顺序）

本文档基于 [后端技术设计方案 `tech_design_ai_bot_v1_2.md`](../technical/tech_design_ai_bot_v1_2.md)（文档版本至 **1.3**，对齐 **PRD v1.1**）拆解开发任务，按阶段组织。任务粒度以 1 小时为单位，便于进度跟踪。可并行执行的任务放在同一阶段内并列列出。

**与技术方案一致的优先级约定**：`projects` 任务分组、**TOT/GOT** 为 **PRD 外可选**（建议 feature flag）；验收以 PRD v1.1 为准时，可先交付必选能力再打开可选模块。

---

### 阶段一：基础环境与脚手架搭建（预计总工时：11h）

#### 任务 1.1：Cloudflare Workers 项目初始化（2h）
- 注册 Cloudflare 账号，安装 Wrangler CLI。
- 初始化 Hono + TypeScript 项目结构。
- 配置 `wrangler.toml`（绑定 D1、R2、环境变量，开启 `nodejs_compat`）。
- 配置 TypeScript、ESLint、Prettier。
- 验证本地开发环境与远程部署。

#### 任务 1.2：D1 数据库设计与迁移（5h）
- 编写 Drizzle ORM Schema：`users`（含 `preferences_json`）、`projects`、`tasks`（含 `detail_json`）、`conversations`、`prompt_templates`、`file_uploads`（含 `folder_path`、`tags`；`processed` 三态 0/1/-1）、**`serper_usage`**。
- 创建迁移目录，编写迁移 SQL：**0001～0006** 基础表 + **`0007_prd_alignment`**（ALTER 新增字段与 `serper_usage`，与技术方案 §4.4 一致）。
- 创建 D1 数据库，执行迁移，验证表结构。
- 编写基础 Repository：`UserRepository`, `TaskRepository`, `ProjectRepository`, `FileRepository`, `PromptRepository`；**`SerperUsageRepository`**（或等价的按用户按日读写封装）。

#### 任务 1.3：R2 存储桶配置与文件存储抽象（2h）
- 创建 R2 存储桶，配置 CORS。
- 实现 `FileStorage` 接口及 `R2Storage` 实现。
- 编写分片上传初始化、分片上传、完成上传、删除、签名 URL 等方法。

#### 任务 1.4：向量数据库 Qdrant 配置（1h）✅
- 注册 Qdrant Cloud 免费层，创建 collection。
- **向量维度与所选 Gemini（或替代）Embedding 模型官方文档一致**，在环境变量或配置中显式记录维度。
- 配置环境变量（QDRANT_URL, QDRANT_API_KEY）。
- 编写 `VectorStore` 接口及 `QdrantStore` 基础实现（upsert, search, delete）；payload 支持 `user_id`、`semantic_type`、**`folder_path`/`tags`**（与技术方案 §4.2 一致）。
- **落地**：`wrangler.toml` 已填 `QDRANT_URL`；`QDRANT_API_KEY` 仅 `.dev.vars`（已 gitignore）/ 生产用 `wrangler secret put`；`npm run qdrant:ensure-collection` 已创建 **`memory`**（768 / Cosine）；`GET /health/qdrant` 可验连通。

#### 任务 1.5：基础工具类与错误处理（1h）✅
- 编写统一错误处理中间件（Hono `onError`）。
- 实现日志工具（`logger.ts`）。
- 定义自定义错误类（ValidationError, DatabaseError, LLMError, FileSizeError）。
- **落地**：`app.onError` + `handle-error.ts`；`src/lib/logger.ts`；`src/errors/*`；`app.notFound` 返回 JSON。

---

### 阶段二：核心服务实现（预计总工时：40h）

#### 并行任务组 A（可并行执行，总工时：19h）

##### 任务 2.1：LLM Provider 抽象与 Gemini 实现（4h）✅
- 定义 `LLMProvider` 接口（chat, streamChat, embed）。
- 实现 `GeminiProvider`，处理消息格式转换、工具定义。
- 解析 API 响应，提取 usageMetadata。
- 实现 `embed` 方法，调用 Gemini 嵌入模型（维度与 Qdrant collection 一致）。
- **落地**：`src/llm/*`（`GeminiProvider`、`createGeminiProvider`、`hasGeminiConfig`）；`GEMINI_API_KEY` + `EMBEDDING_MODEL`（默认 `text-embedding-004`）；`GET /health/llm`；`embed` 按 `EMBEDDING_DIMENSIONS` 校验长度。

##### 任务 2.2：记忆召回模块 MemoryService（4h）✅
- 实现 `MemoryService` 类，依赖 `VectorStore` 和 `LLMProvider`。
- 实现 `retrieve` 方法：向量化用户输入，在 Qdrant 中检索相似片段。
- 实现 `addToMemory` 方法：将对话/文档片段向量化并存储。
- 支持按 `user_id` 过滤，支持 **`semantic_type` / `folder_path`（及 tags 若 payload 已存）** 过滤。
- **落地**：`src/memory/*`；`retrieve` / `retrieveWithScores` / `retrieveForRag`（供 Chat SSE `citation`）；`addToMemory` + payload 含 `filename` 可选；`createMemoryService`；`GET /health/memory`。

##### 任务 2.3：工具注册与调用模块 ToolRegistry（5h）✅
- 设计 `Tool` 接口（name, description, parametersSchema, execute）；execute 侧可注入 **当前 userId**（与技术方案 `ToolContext` 示意一致）。
- 实现 `ToolRegistry` 类：注册工具、获取工具定义、执行工具调用。
- **`SearchTool`**：调用 Serper，**type 枚举与方案一致**（organic, news, images, videos, places, shopping, scholar, patents）；集成 **`SerperUsageRepository` / SerperQuotaService**：成功调用后递增 `serper_usage`，超软上限时友好提示（技术方案 §14）。
- **`WorkspaceFilesTool`（`manage_workspace_files`）**：封装列表/删除/重命名/更新语义类型/标签，内部调用 `FileService.handleToolAction`，严禁越权。
- 编写 **`UserTool`**（若方案中独立存在）或与用户更新逻辑对齐的工具；**`plan_research`** 可在阶段三与 PlannerService 一并注册。
- **落地**：`src/serper/*`、`src/files/file-service.ts`、`search` / `manage_workspace_files` / `update_user_profile`；`SERPER_DAILY_SOFT_LIMIT`；`GET /health/serper`；`plan_research` 仍留待阶段三。

##### 任务 2.4：Prompt 模板管理模块（3h）✅
- 实现 `PromptRepository`，提供增删改查方法。
- 实现 `PromptService`：加载模板、渲染变量（用户姓名、AI 昵称、**`preferences_json` 摘要**、工具定义）。
- 编写默认模板（default, interview, research）并插入数据库；**default 模板须包含 `manage_workspace_files` 职责说明**（技术方案 §7.4 / 迁移默认数据）。
- **落地**：`PromptRepository` 已具备 CRUD；`PromptService.render` 注入 `{{PREFERENCES_BLOCK}}` / `{{PREFERENCES_SUMMARY}}` 与 `{{TOOLS_DEFINITIONS}}`；迁移 **`0008_prompt_templates_scenarios.sql`** 更新 default 并 **INSERT** `interview` / `research`；`src/prompt/index.ts`。

##### 任务 2.5：意图分类器（3h）✅
- 实现 `IntentClassifier` 接口及 `RuleBasedIntentClassifier`（关键词匹配）。
- 定义意图类别：**greeting, task_operation, interview, research, file_upload, `workspace_operation`, default**（与技术方案 §9.6 一致）。
- 编写正则表达式模式。
- **落地**：`src/intent/*`（`KNOWN_INTENTS`、有序 `RULES`、`file_upload` 优先于 `workspace_operation`）；`getDefaultIntentRules()`；`classify` 末尾回退 `default`（避免文档示例中 `/.*/` 误匹配）。

#### 并行任务组 B（可并行执行，总工时：21h）

##### 任务 2.6：对话管理模块 ChatService（9h）
- 实现 `ChatService.handleMessage`：构建消息历史（系统提示 + 短期记忆 + RAG 片段）；**系统提示注入 `preferences_json`**（技术方案 §9.5）。
- 集成 `IntentClassifier` 和 `PromptService`，选择模板并渲染。
- 集成 `LLMProvider` 和 `ToolRegistry`，实现 ReAct 循环。
- 处理工具调用，将工具结果注入对话继续循环。
- **SSE**：除 `token` / `tool_call` / `intention` / `done` 外，实现 **`tool_result_meta`（搜索等工具的原始结构化摘要）** 与 **`citation`（RAG 命中）** 事件，供前端悬停展示（技术方案 §5.1）。
- 保存用户消息和 AI 回复到 `conversations` 表（填充 intention, prompt_id, keywords, conversation_id）。
- 实现 `extractKeywords` 辅助方法（简单 NER，可先留空，后续集成）。

##### 任务 2.7：任务管理模块（4h）
- 实现 TaskRepository（增删改查），**支持 `detail_json`（子任务等结构化字段）**。
- 实现 `TaskTool`（add_task, list_tasks, update_task, delete_task），读写 **`detail_json`**。
- 将 `TaskTool` 注册到 `ToolRegistry`。
- 编写 API 路由（`/api/tasks`）提供 REST 接口；POST/PUT 支持 **`detail` 与 `detail_json` 映射**。

##### 任务 2.8：用户管理模块（3h）
- 实现 UserRepository，**读写 `preferences_json`**。
- 实现 `/api/user` 的 GET 和 PUT（**`preferences` 字段与 JSON 列互转**）。
- 实现 `/api/user/ai-name` 接口。

##### 任务 2.9：文件管理模块 FileService（5h）
- 实现 FileRepository（**`folder_path`、`tags`、`processed` 三态**）。
- 实现 FileService：**list（按 `folder_path` 前缀与 `semantic_type` 过滤）**、delete、rename、updateSemanticType、**updateTags**、**`handleToolAction`（供 WorkspaceFilesTool）**、getDownloadUrl。
- 实现文件上传流程（小文件直接上传，大文件分片）；**initiate-multipart / complete-multipart 请求体支持 `folder_path`、`tags`**。
- 集成 R2 存储；**单文件 ≤64MB 校验**（技术方案 §14）。
- 实现文件异步处理（文本提取、向量化）的触发机制（Workers 队列或 Durable Objects）；**`processed = -1` 失败态与重试**与技术方案一致。

---

### 阶段三：高级功能实现（预计总工时：29h）

#### 并行任务组 C（可并行执行，总工时：13h）

##### 任务 3.1：子代理规划模块 PlannerService（4h）
- 实现 `PlannerService.planAndExecute`：生成子任务列表（调用 LLM）。
- 实现 `SubAgent` 类：执行单个子任务（可调用工具）。
- 集成到 `ChatService`，当用户请求「深度研究」时触发；**内部搜索调用同样走 Serper 用量计数与软上限**（与技术方案一致）。

##### 任务 3.2：TOT/GOT 高级推理工具（4h，**可选 / PRD 外**）
- 实现 `TotTool`：构建思考树，评估选择最优分支。
- 实现 `GotTool`：构建思考图，迭代优化。
- 注册到 `ToolRegistry`，由 LLM 按需调用；**默认建议 feature flag 关闭**，避免 token 与延迟超预期（技术方案 §9.4）。

##### 任务 3.3：文件异步处理与 RAG 集成（5h）
- 实现 `FileProcessor` / `file-parser`：**按技术方案 §4.5 分 MIME 策略**——PDF/Word/文本向量化；Excel 文本提取（行数上限可配置）；图片可选 OCR；**音视频不向量化、仅元数据**；失败时 `processed = -1`。
- 异步将可索引文本分块，调用 LLM 生成向量，存入 Qdrant（payload 含 **file_id、semantic_type、folder_path、tags**）。
- 在 FileService 上传完成后触发后台任务。
- 在 `MemoryService` 中支持按 **semantic_type**（及需要时的路径/标签）过滤检索。

#### 并行任务组 D（可并行执行，总工时：16h）

##### 任务 3.4：API 路由整合与中间件（5h）
- 实现 `/api/chat/stream` 路由，集成 SSE 流式响应（**含 `tool_result_meta`、`citation` 事件**）。
- 实现 `/api/files/*`：**列表、小文件上传、initiate-multipart、complete-multipart**、删除、重命名、**PUT `/api/files/:id/tags`**、语义类型、下载（与技术方案 §5.4 对齐）。
- 实现 `/api/prompts/*` 管理路由（管理员）。
- 添加 CORS 中间件、错误处理中间件、请求日志。
- 使用 Zod 验证请求体。

##### 任务 3.5：文件上传与异步处理联调（4h）
- **后端**：分片上传以 **R2 预签名 URL + 前端 XHR 进度** 为主（技术方案 §12）；异步处理完成后更新 D1 `processed` 与 Qdrant；可选补充管理端查询处理状态接口（若产品需要）。
- 与前端联调：占位节点、进度条、成功/失败/重试；**不强制**后端 SSE 推送上传字节进度。

##### 任务 3.6：对话流式与引用数据联调（4h）
- 联调 SSE：`tool_result_meta`、`citation` 与前端富文本 **`<rag>` / 搜索来源悬停**（以后端契约为准；前端实现见前端任务列表）。
- 验证工具调用与最终 assistant 正文中的引用标记一致。

##### 任务 3.7：工作空间 API 与路径/标签（3h）
- 验证 `GET /api/files?folder=` 与 `folder_path` 前缀匹配行为。
- 联调 **标签**（含对话 **`manage_workspace_files` → set_tags**）与列表展示。

---

### 阶段四：测试与优化（预计总工时：18h）

#### 并行任务组 E（可并行执行，总工时：18h）

##### 任务 4.1：单元测试（8h）
- 为核心模块编写单元测试（使用 Vitest）：
  - LLMProvider 模拟测试
  - ToolRegistry 注册与执行（**含 SearchTool 配额逻辑、WorkspaceFilesTool 权限**）
  - MemoryService 检索逻辑（**含过滤条件**）
  - Prompt 模板渲染（**preferences**）
  - ChatService 循环逻辑与 **SSE 事件构造**（可测序列）
  - IntentClassifier 规则匹配（**workspace_operation**）
  - SerperUsageRepository / 软上限
  - FileProcessor 分 MIME 分支（至少 PDF 与「跳过向量化」类型）

##### 任务 4.2：集成测试与端到端测试（6h）
- 编写集成测试，模拟完整对话流程（含 **search、manage_workspace_files、任务 detail_json**）。
- 使用 Playwright 进行端到端测试（用户登录 → 对话 → 任务管理 → 文件上传 → RAG 检索）。

##### 任务 4.3：性能优化与监控（4h）
- 分析冷启动时间，优化全局代码（避免重计算）。
- 添加埋点（LLM 调用耗时、工具调用成功率、文件上传时间、**search_executed / serper 计数**）。
- 设置日志和监控（wrangler tail 集成）。

---

### 阶段五：部署与文档（预计总工时：10h）

#### 并行任务组 F（可并行执行，总工时：10h）

##### 任务 5.1：生产环境配置与部署（3h）
- 创建生产环境 D1 和 R2 资源。
- 设置环境变量（Secrets）。
- 配置自定义域名（可选）。
- 执行部署脚本，验证生产环境功能。

##### 任务 5.2：API 文档与用户手册（4h）
- 编写 API 接口文档（Swagger/OpenAPI 格式），**包含 SSE 事件类型与示例**。
- 编写用户使用手册（功能介绍、常见问题）。
- 更新 README。

##### 任务 5.3：压力测试与容量规划（3h）
- 使用 k6 或 wrangler 的负载测试功能，模拟并发用户。
- 分析 CPU 时间、内存使用、子请求限制，确保在免费额度内。

---

## 总工时估算汇总

| 阶段 | 工时 |
|------|------|
| 阶段一：基础环境与脚手架搭建 | 11h |
| 阶段二：核心服务实现 | 40h |
| 阶段三：高级功能实现 | 29h |
| 阶段四：测试与优化 | 18h |
| 阶段五：部署与文档 | 10h |
| **总计** | **108h** |

按每日有效工作 6 小时计算，约需 **18 个工作日**（不含并行优化）。并行任务可多人同时进行，实际交付周期可缩短。

---

## 并行执行建议

- **阶段二** 中，任务组 A（LLM Provider、MemoryService、ToolRegistry、Prompt 管理、IntentClassifier）可由 2 人并行开发，组 B（ChatService、任务管理、用户管理、文件管理）由另 2 人并行，总计 4 人可在 2～3 天内完成（视 WorkspaceFilesTool / SSE 引用块复杂度略增）。
- **阶段三** 中，**3.2（TOT/GOT）可整组后置或单独分支**，不阻塞 PRD v1.1 验收路径。
- **阶段四** 和 **阶段五** 可在功能开发的同时并行进行。

此任务列表可根据实际团队配置灵活调整，确保每个任务粒度可追踪。
