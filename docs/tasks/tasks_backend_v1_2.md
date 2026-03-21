## 项目开发任务列表（按时间顺序）

本文档基于后端技术设计方案（1.0版本）及产品需求文档，拆解出详细的开发任务，按阶段组织。任务粒度以1小时为单位，便于进度跟踪。可并行执行的任务放在同一阶段内并列列出。

---

### 阶段一：基础环境与脚手架搭建（预计总工时：10h）

#### 任务 1.1：Cloudflare Workers 项目初始化（2h）
- 注册 Cloudflare 账号，安装 Wrangler CLI。
- 初始化 Hono + TypeScript 项目结构。
- 配置 `wrangler.toml`（绑定 D1、R2、环境变量，开启 `nodejs_compat`）。
- 配置 TypeScript、ESLint、Prettier。
- 验证本地开发环境与远程部署。

#### 任务 1.2：D1 数据库设计与迁移（4h）
- 编写 Drizzle ORM Schema（users, projects, tasks, conversations, prompt_templates, file_uploads）。
- 创建迁移目录，编写 6 个迁移 SQL 文件（0001~0006）。
- 创建 D1 数据库，执行迁移，验证表结构。
- 编写基础 Repository 类（UserRepository, TaskRepository, ProjectRepository, FileRepository, PromptRepository）。

#### 任务 1.3：R2 存储桶配置与文件存储抽象（2h）
- 创建 R2 存储桶，配置 CORS。
- 实现 `FileStorage` 接口及 `R2Storage` 实现。
- 编写分片上传初始化、分片上传、完成上传、删除、签名 URL 等方法。

#### 任务 1.4：向量数据库 Qdrant 配置（1h）
- 注册 Qdrant Cloud 免费层，创建 collection。
- 配置环境变量（QDRANT_URL, QDRANT_API_KEY）。
- 编写 `VectorStore` 接口及 `QdrantStore` 基础实现（upsert, search, delete）。

#### 任务 1.5：基础工具类与错误处理（1h）
- 编写统一错误处理中间件（Hono `onError`）。
- 实现日志工具（`logger.ts`）。
- 定义自定义错误类（ValidationError, DatabaseError, LLMError, FileSizeError）。

---

### 阶段二：核心服务实现（预计总工时：36h）

#### 并行任务组 A（可并行执行，总工时：18h）

##### 任务 2.1：LLM Provider 抽象与 Gemini 实现（4h）
- 定义 `LLMProvider` 接口（chat, streamChat, embed）。
- 实现 `GeminiProvider`，处理消息格式转换、工具定义。
- 解析 API 响应，提取 usageMetadata。
- 实现 `embed` 方法，调用 Gemini 嵌入模型。

##### 任务 2.2：记忆召回模块 MemoryService（4h）
- 实现 `MemoryService` 类，依赖 `VectorStore` 和 `LLMProvider`。
- 实现 `retrieve` 方法：向量化用户输入，在 Qdrant 中检索相似片段。
- 实现 `addToMemory` 方法：将对话/文档片段向量化并存储。
- 支持按 user_id 过滤，支持语义类型过滤。

##### 任务 2.3：工具注册与调用模块 ToolRegistry（4h）
- 设计 `Tool` 接口（name, description, parametersSchema, execute）。
- 实现 `ToolRegistry` 类：注册工具、获取工具定义、执行工具调用。
- 编写基础工具示例：`SearchTool`（调用 Serper API）。

##### 任务 2.4：Prompt 模板管理模块（3h）
- 实现 `PromptRepository`，提供增删改查方法。
- 实现 `PromptService`：加载模板、渲染变量（用户姓名、AI昵称、工具定义）。
- 编写默认模板（default, interview, research）并插入数据库。

##### 任务 2.5：意图分类器（3h）
- 实现 `IntentClassifier` 接口及 `RuleBasedIntentClassifier`（关键词匹配）。
- 定义意图类别（greeting, task_operation, interview, research, file_upload, default）。
- 编写正则表达式模式。

#### 并行任务组 B（可并行执行，总工时：18h）

##### 任务 2.6：对话管理模块 ChatService（8h）
- 实现 `ChatService.handleMessage`：构建消息历史（系统提示 + 短期记忆 + RAG 片段）。
- 集成 `IntentClassifier` 和 `PromptService`，选择模板并渲染。
- 集成 `LLMProvider` 和 `ToolRegistry`，实现 ReAct 循环。
- 处理工具调用，将工具结果注入对话继续循环。
- 保存用户消息和 AI 回复到 `conversations` 表（填充 intention, prompt_id, keywords, conversation_id）。
- 实现 `extractKeywords` 辅助方法（简单 NER，可先留空，后续集成）。

##### 任务 2.7：任务管理模块（4h）
- 实现 TaskRepository（增删改查）。
- 实现 `TaskTool`（add_task, list_tasks, update_task, delete_task）。
- 将 `TaskTool` 注册到 `ToolRegistry`。
- 编写 API 路由（/api/tasks）提供 REST 接口。

##### 任务 2.8：用户管理模块（2h）
- 实现 UserRepository。
- 实现 `/api/user` 的 GET 和 PUT 接口。
- 实现 `/api/user/ai-name` 接口。

##### 任务 2.9：文件管理模块 FileService（4h）
- 实现 FileRepository。
- 实现 FileService 核心方法（list, delete, rename, updateSemanticType, getDownloadUrl）。
- 实现文件上传流程（小文件直接上传，大文件分片）。
- 集成 R2 存储。
- 实现文件异步处理（文本提取、向量化）的触发机制（使用 Workers 队列或 Durable Objects）。

---

### 阶段三：高级功能实现（预计总工时：26h）

#### 并行任务组 C（可并行执行，总工时：12h）

##### 任务 3.1：子代理规划模块 PlannerService（4h）
- 实现 `PlannerService.planAndExecute`：生成子任务列表（调用 LLM）。
- 实现 `SubAgent` 类：执行单个子任务（可调用工具）。
- 集成到 `ChatService`，当用户请求“深度研究”时触发。

##### 任务 3.2：TOT/GOT 高级推理工具（4h）
- 实现 `TotTool`：构建思考树，评估选择最优分支。
- 实现 `GotTool`：构建思考图，迭代优化。
- 注册到 `ToolRegistry`，由 LLM 按需调用。

##### 任务 3.3：文件异步处理与 RAG 集成（4h）
- 实现 `FileProcessor`：提取文本（PDF、Word、TXT 等）。
- 异步将文本分块，调用 LLM 生成向量，存入 Qdrant。
- 在 FileService 上传完成后触发后台任务（Workers 队列或 Durable Objects）。
- 在 `MemoryService` 中支持按 semantic_type 过滤检索。

#### 并行任务组 D（可并行执行，总工时：14h）

##### 任务 3.4：API 路由整合与中间件（4h）
- 实现 `/api/chat/stream` 路由，集成 SSE 流式响应。
- 实现 `/api/files/*` 全部路由（列表、上传、删除、重命名、下载）。
- 实现 `/api/prompts/*` 管理路由（管理员）。
- 添加 CORS 中间件、错误处理中间件、请求日志。
- 使用 Zod 验证请求体。

##### 任务 3.5：SSE 进度推送与文件上传前端联调（4h）
- 后端：在文件上传异步处理时，通过 SSE 推送进度（可选）。
- 前端：实现 XMLHttpRequest 分片上传进度监听，更新 UI 进度条。
- 联调文件上传的完整流程（占位节点 → 进度条 → 成功/失败状态）。

##### 任务 3.6：对话接口流式输出与前端集成（4h）
- 前端使用 Vercel AI SDK 的 `useChat` 接入 SSE。
- 实现富文本渲染，支持 `<tool>` 和 `<rag>` 标签的鼠标悬浮展示原始数据。
- 实现工作空间（文件浏览器）UI 组件。

##### 任务 3.7：用户工作空间前端交互（2h）
- 实现文件列表展示（网格/列表视图）。
- 实现拖拽上传区域、文件夹创建（可选）。
- 实现文件重命名、删除、下载的 UI 操作。

---

### 阶段四：测试与优化（预计总工时：18h）

#### 并行任务组 E（可并行执行，总工时：18h）

##### 任务 4.1：单元测试（8h）
- 为核心模块编写单元测试（使用 Vitest）：
  - LLMProvider 模拟测试
  - ToolRegistry 注册与执行
  - MemoryService 检索逻辑
  - Prompt 模板渲染
  - ChatService 循环逻辑
  - IntentClassifier 规则匹配

##### 任务 4.2：集成测试与端到端测试（6h）
- 编写集成测试，模拟完整对话流程（含工具调用）。
- 使用 Playwright 进行端到端测试（用户登录 → 对话 → 任务管理 → 文件上传 → RAG 检索）。

##### 任务 4.3：性能优化与监控（4h）
- 分析冷启动时间，优化全局代码（避免重计算）。
- 添加埋点（LLM 调用耗时、工具调用成功率、文件上传时间）。
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
- 编写 API 接口文档（Swagger/OpenAPI 格式）。
- 编写用户使用手册（功能介绍、常见问题）。
- 更新 README。

##### 任务 5.3：压力测试与容量规划（3h）
- 使用 k6 或 wrangler 的负载测试功能，模拟并发用户。
- 分析 CPU 时间、内存使用、子请求限制，确保在免费额度内。

---

## 总工时估算汇总

| 阶段 | 工时 |
|------|------|
| 阶段一：基础环境与脚手架搭建 | 10h |
| 阶段二：核心服务实现 | 36h |
| 阶段三：高级功能实现 | 26h |
| 阶段四：测试与优化 | 18h |
| 阶段五：部署与文档 | 10h |
| **总计** | **100h** |

按每日有效工作 6 小时计算，约需 **17 个工作日**（不含并行优化）。并行任务可多人同时进行，实际交付周期可缩短。

---

## 并行执行建议

- **阶段二** 中，任务组 A（LLM Provider、MemoryService、ToolRegistry、Prompt 管理、IntentClassifier）可由 2 人并行开发，组 B（ChatService、任务管理、用户管理、文件管理）由另 2 人并行，总计 4 人可在 2-3 天内完成。
- **阶段三** 类似，高级功能可拆分给不同开发者。
- **阶段四** 和 **阶段五** 可在功能开发的同时并行进行。

此任务列表可根据实际团队配置灵活调整，确保每个任务粒度可追踪。