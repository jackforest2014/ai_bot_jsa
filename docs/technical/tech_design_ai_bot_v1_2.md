# 后端技术设计方案（v1.2，对齐 PRD v1.1）

## 文档版本
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-21 | AI Assistant | 初稿完成（包含完整技术选型、架构、实现细节、LLM调用设计） |
| 1.1 | 2026-03-21 | AI Assistant | 新增个人工作空间与文件管理模块（上传、RAG、前端交互） |
| 1.2 | 2026-03-21 | AI Assistant | 完善文件上传进度反馈；增加场景化 Prompt 模板与意图识别；扩展 conversations 表结构 |
| 1.3 | 2026-03-21 | AI Assistant | 对照 PRD v1.1 修订：去重章节、补齐 FileTool/SSE 引用块、文件夹与标签字段、任务 detail、用户偏好、Serper 配额、搜索类型与文件处理策略说明；标明 TOT/GOT 与 projects 为 PRD 外可选扩展 |
| 1.4 | 2026-03-21 | AI Assistant | 对齐 [PRD v1.2](../products/ai_bot_v1_1.md)：`chat_sessions` 多会话、`messages.session_id`、匿名昵称登录与可选邮箱、会话历史 API、首轮资料缺口 Prompt、流式结束后自动标题、认证接口 |
| 1.5 | 2026-03-22 | AI Assistant | 新增 **§9.9 多 Agent 编排**（Orchestrator + 专业 Agent、`confirm_tool_creation`、Agent 内 GOT 可选、进程内 AgentBus 预留）；任务拆解见 [`docs/tasks/tasks_backend_multi_agent_orchestration.md`](../tasks/tasks_backend_multi_agent_orchestration.md) |
| 1.6 | 2026-03-22 | AI Assistant | §9.9 产品约束：**子任务 2 无需用户点确认**（任务成功后自动进入路线 Agent）；**重试前 `confirm_tool_creation`** 防重复建任务；分解策略先实现再迭代；**成本暂不纳入优化目标**；**体感延迟**靠 Orchestrator 经 SSE 高频同步阶段与进度 |
| 1.7 | 2026-03-22 | AI Assistant | §9.9.6.1 / §9.9.6.2：编排模式 **SSE 最小事件集合** 字段级契约 + TypeScript 形状；兼容旧前端忽略未知事件 |
| 1.8 | 2026-03-22 | AI Assistant | §9.9.10：**主 Agent / 编排无法识别或分解失败** 时的降级（`default` 意图、`fallback_single_chat`、空 `steps`） |
| 1.9 | 2026-03-22 | AI Assistant | **§9.1.1 事实检索与 Search Agent**：首轮 `search(organic)` 强制、与找图/高德/任务收窄的优先级、ReAct 上限 3 轮；`token.source: search_agent`；`detect-factual-web-search-intent` 与系统时钟规则 3（b）对齐说明 |

### 与 PRD v1.1 / v1.2 的范围说明

- **必选对齐**：对话式任务与文件管理、Serper 搜索与降级、RAG、工作空间上传与进度、64MB 限制、数据隔离等均按 PRD 设计。
- **PRD v1.2 增补（本版后端须实现或已规划）**：**多会话（线程）** 与按会话拉取消息；**退出再登录** 历史不丢；**匿名登录**（显示名称全库唯一、邮箱可空）；**首轮助手回复** 在资料缺失时并列询问姓名/邮箱；**会话自动标题** 与 **PATCH 重命名**。
- **PRD 未要求但本方案保留的扩展**：`projects` 任务分组、**TOT/GOT** 高级推理工具——实现阶段可作为**可选模块**开关，不纳入 PRD v1.1 验收范围。
- **向量维度**：下文示例维度与所用 **Gemini Embedding 模型官方文档**一致为准，集成前须在代码与环境变量中核对实际维度。

---

## 目录

- [1. 技术选型与理由](#1-技术选型与理由)
  - [1.1 关于 Python 的劣势分析](#11-关于-python-的劣势分析)
  - [1.2 Agent 框架选型决策](#12-agent-框架选型决策)
    - [1.2.1 关于 Cloudflare 体积限制的补充说明](#121-关于-cloudflare-体积限制的补充说明)
- [2. 整体架构设计](#2-整体架构设计)
- [3. 模块划分](#3-模块划分)
- [4. 数据存储设计](#4-数据存储设计)
  - [4.1 关系型数据库（Cloudflare D1）](#41-关系型数据库cloudflare-d1)
  - [4.2 向量数据库（Qdrant）](#42-向量数据库qdrant)
  - [4.3 时间字段设计说明](#43-时间字段设计说明)
  - [4.4 数据库迁移脚本（D1）](#44-数据库迁移脚本d1)
  - [4.5 上传文件类型与 RAG 处理策略](#45-上传文件类型与-rag-处理策略)
  - [5. API 接口设计](#5-api-接口设计)
  - [5.0 认证接口（匿名昵称登录）](#50-认证接口匿名昵称登录)
  - [5.1 对话接口（SSE 流式）](#51-对话接口sse-流式)
  - [5.1.1 会话（线程）与历史消息](#511-会话线程与历史消息)
  - [5.2 用户信息接口](#52-用户信息接口)
  - [5.3 任务接口](#53-任务接口)
  - [5.4 文件管理接口](#54-文件管理接口)
  - [5.5 Prompt 模板管理接口（可选）](#55-prompt-模板管理接口可选)
- [6. 核心抽象设计](#6-核心抽象设计)
  - [6.1 LLM 提供者抽象](#61-llm-提供者抽象)
  - [6.2 向量数据库抽象](#62-向量数据库抽象)
  - [6.3 关系数据库抽象（Drizzle ORM）](#63-关系数据库抽象drizzle-orm)
  - [6.4 文件存储抽象](#64-文件存储抽象)
- [7. Prompt 模板与场景化设计](#7-prompt-模板与场景化设计)
  - [7.1 设计思路](#71-设计思路)
  - [7.2 模板存储](#72-模板存储)
  - [7.3 意图识别与模板选择](#73-意图识别与模板选择)
  - [7.4 模板示例](#74-模板示例)
  - [7.5 实现细节](#75-实现细节)
- [8. LLM 调用核心设计](#8-llm-调用核心设计)
  - [8.1 Prompt 设计（更新）](#81-prompt-设计更新)
  - [8.2 Context 设计](#82-context-设计)
  - [8.3 LLM 生成的评估](#83-llm-生成的评估)
  - [8.4 Tokens 消耗与成本跟踪框架](#84-tokens-消耗与成本跟踪框架)
- [9. Agent 实现原理与无框架方案设计](#9-agent-实现原理与无框架方案设计)
  - [9.1 ReAct 循环实现](#91-react-循环实现)
  - [9.1.1 首轮工具收窄与事实检索（Search Agent）](#911-首轮工具收窄与事实检索search-agent)
  - [9.2 工具注册与调用](#92-工具注册与调用)
  - [9.3 规划与子代理（深度研究）](#93-规划与子代理深度研究)
  - [9.4 高级推理模式：TOT / GOT 实现](#94-高级推理模式tot--got-实现)
  - [9.5 记忆与上下文管理](#95-记忆与上下文管理)
  - [9.6 意图识别与 Prompt 模板选择](#96-意图识别与-prompt-模板选择)
  - [9.7 对话记录持久化](#97-对话记录持久化)
  - [9.8 总结](#98-总结)
  - [9.9 多 Agent 编排：Orchestrator 与专业 Agent（演进）](#99-多-agent-编排orchestrator-与专业-agent演进)
- [10. 类图（Mermaid）](#10-类图mermaid)
- [11. 主要交互流程（Mermaid）](#11-主要交互流程mermaid)
  - [11.1 完整对话流程（含意图识别与模板选择）](#111-完整对话流程含意图识别与模板选择)
  - [11.2 深度研究流程（子代理规划）](#112-深度研究流程子代理规划)
  - [11.3 文件上传与 RAG 处理流程（含进度反馈）](#113-文件上传与-rag-处理流程含进度反馈)
  - [11.4 TOT 高级推理流程](#114-tot-高级推理流程)
  - [11.5 用户首次访问与信息收集流程](#115-用户首次访问与信息收集流程)
- [12. 文件上传进度反馈详细设计](#12-文件上传进度反馈详细设计)
  - [12.1 前端实现](#121-前端实现)
  - [12.2 后端支持](#122-后端支持)
  - [12.3 失败处理](#123-失败处理)
  - [12.4 UI 表现](#124-ui-表现)
- [13. 文件目录组织结构](#13-文件目录组织结构)
- [14. 异常处理策略](#14-异常处理策略)
- [15. 数据埋点设计](#15-数据埋点设计)
- [16. 性能描述与优化](#16-性能描述与优化)
- [17. 安全与隐私](#17-安全与隐私)
- [18. 部署 Cloudflare Workers 流程](#18-部署-cloudflare-workers-流程)
  - [18.1 前置准备](#181-前置准备)
  - [18.2 配置 wrangler.toml](#182-配置-wranglertoml)
  - [18.3 初始化 D1 数据库](#183-初始化-d1-数据库)
  - [18.4 构建与部署](#184-构建与部署)
  - [18.5 设置环境变量（Secret）](#185-设置环境变量secret)
  - [18.6 绑定自定义域名（可选）](#186-绑定自定义域名可选)
  - [18.7 监控与日志](#187-监控与日志)
- [19. 总结](#19-总结)

---

## 1. 技术选型与理由

| 组件 | 技术选型 | 理由 |
|------|----------|------|
| **运行环境** | Cloudflare Workers | 全球边缘部署，低延迟；无服务器架构，自动扩缩容；免费额度充足，符合项目成本要求；原生支持 D1、R2 等存储。 |
| **编程语言** | **TypeScript (Node.js 兼容)** | 与 Cloudflare Workers 生态完美集成；类型安全减少运行时错误；V8 引擎冷启动 < 50ms；生态丰富（Hono、Drizzle ORM 等）。 |
| **Web 框架** | **Hono (TypeScript)** | 轻量级（13KB），专为 Workers 优化；原生 TypeScript 支持；内置中间件（JWT、CORS、日志）；原生支持 Server-Sent Events。 |
| **AI 模型** | Gemini 2.0 Flash Lite (Google AI Studio) | 免费额度，响应速度快；支持函数调用（工具调用），便于实现工具注入和子代理规划。 |
| **LLM 抽象层** | 自定义 `LLMProvider` 接口 | 抽象具体模型调用，便于后续切换 OpenAI、Claude 等，保持业务逻辑稳定。 |
| **向量数据库** | Qdrant Cloud (免费层) | 存储对话片段、简历/文档的向量表示，支持语义检索和记忆召回；免费层 1GB 存储足够原型使用。 |
| **向量数据库抽象** | 自定义 `VectorStore` 接口 | 抽象向量存储操作，便于替换为 Pinecone、Weaviate 或本地 Milvus。 |
| **关系型数据库** | Cloudflare D1 (SQLite) | 存储用户信息、任务列表、AI昵称等结构化数据；与 Workers 同环境，零延迟；SQL 易于管理。 |
| **关系数据库抽象** | **Drizzle ORM** | 类型安全的 SQL 构建器，自动推导数据库 schema；支持 D1、PostgreSQL、MySQL 等，便于未来迁移。 |
| **搜索 API** | Serper.dev (免费额度) | 1-2 秒内返回 Google 搜索结果，结构化 JSON；支持网页、图片、新闻等类型，满足深度研究需求。 |
| **文件存储** | Cloudflare R2 | 存储用户上传的简历、导出的报告等文件；S3 兼容 API，成本低廉，支持分片上传和进度监控。 |
| **前端框架** | Vercel AI SDK + Tailwind CSS | Vercel AI SDK 提供 React hooks 和流式对话支持，简化前端集成；Tailwind CSS 快速构建 UI。 |

---

### 1.1 关于 Python 的劣势分析

尽管 Python 在 AI 生态中拥有丰富的库（如 LangChain、Transformers），但在 **Cloudflare Workers** 环境中，选择 Python 会面临以下劣势：

| 维度 | 劣势说明 |
|------|----------|
| **原生支持** | Workers 运行时原生支持 JavaScript/TypeScript，Python 需通过 `python_workers`（beta）或 WASM 运行，存在性能损耗和功能限制。 |
| **冷启动** | Python 解释器启动时间明显长于 V8 引擎，冷延迟可能达到数百毫秒甚至秒级，影响对话首字时间。 |
| **生态适配** | 主流 AI/数据库 SDK（如 Gemini、Serper、Qdrant）均为 Python 提供了完整客户端，但 Workers 环境要求异步、无状态，多数 Python SDK 为同步设计，需额外封装。 |
| **依赖管理** | Python 依赖包体积大，且 Workers 对 `site-packages` 有大小限制（1MB），部署复杂。 |
| **工具链** | TypeScript 有 Hono、Drizzle、Vercel AI SDK 等专为边缘环境优化的库，Python 生态更偏向传统服务器。 |
| **类型安全** | Python 虽支持类型注解，但运行时无强制检查，工具定义等易出错。 |

因此，在 Cloudflare Workers 上构建本项目，**TypeScript/Node.js 是最优选择**。

---

### 1.2 Agent 框架选型决策

在 Agent 实现方式上，我们决定 **不引入 LangChain/LangGraph 等现成框架**，而是采用轻量自研方案。理由如下：

1. **架构哲学**：将智能交给模型，将确定性交给基础设施。当模型足够强大时，硬编码的 chain 或 graph 反而成为障碍。决策权在 LLM 而非代码，新模型发布时能力自动增强。
2. **Cloudflare Workers 环境约束**：包体积限制（免费 3 MB，付费 10 MB）和冷启动要求极低的框架开销。LangChain.js 等框架即使压缩后也可能占 2 MB 以上，而自研核心代码不足 500 KB，留足扩展空间。
3. **框架实际价值有限**：框架主要提供 LLM 接口统一、工具预置和 ReAct 循环脚手架，但这些都可以用少量代码自行实现。框架解决不了规划、错误恢复、上下文管理等核心难题。
4. **MCP 标准正削弱框架价值**：工具方直接提供 MCP Server，模型直接返回结构化 `tool_call`，框架的集成价值下降。
5. **可控性与可观测性**：自研实现使每一步逻辑透明，便于调试和定制化。

因此，我们选择在 `ChatService` + `ToolRegistry` + `PlannerService` 中自行实现 ReAct 循环、工具调用和规划能力，确保轻量、高效、完全可控。

#### 1.2.1 关于 Cloudflare 体积限制的补充说明

根据 Cloudflare 官方文档（2026 年 3 月），Workers 的包体积限制已提升至：
- **免费计划**：压缩后 3 MB
- **付费计划**：压缩后 10 MB

这一变化进一步减轻了包体积压力，但并未改变我们选择轻量自研 Agent 的核心决策。理由如下：

- **自研方案体积优势依然显著**：即使 3 MB 的免费额度，LangChain.js 及其依赖（约 2 MB）仍会占用大量配额，而我们的自研核心代码压缩后不足 500 KB，为未来功能扩展留足空间。
- **边缘环境冷启动要求未变**：框架层仍会增加解析和初始化时间，自研方案更利于保持冷启动 < 50ms。
- **可充分利用新特性**：
  - 在 `wrangler.toml` 中开启 `nodejs_compat` 标志，可使用内置 Node.js API（不计入包体积），进一步优化依赖。
  - 静态资源（如 PDF 模板）可存储于 R2，避免打包到 Worker 脚本中。

因此，尽管限制放宽，自研方案在可维护性、可控性和边缘适配性上仍是本项目的最佳选择。

---

## 2. 整体架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Vercel AI SDK + ChatUI)           │
│                     - 对话界面                                   │
│                     - 富文本渲染（工具调用标记、RAG 浮窗）         │
│                     - 工作空间（文件浏览器、拖拽上传、进度条）    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / SSE / 文件上传
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker (Hono)                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      API Gateway                          │  │
│  │   - 路由分发 / 认证 / 限流 / 日志                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      核心服务层                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │  │
│  │  │ 用户管理模块 │ │ 对话管理模块 │ │  任务管理模块    │   │  │
│  │  └─────────────┘ └─────────────┘ └──────────────────┘   │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │  │
│  │  │ 记忆召回模块 │ │ 工具调用模块 │ │ 子代理规划模块   │   │  │
│  │  └─────────────┘ └─────────────┘ └──────────────────┘   │  │
│  │  ┌─────────────┐ ┌─────────────────────────────────┐   │  │
│  │  │ TOT/GOT(可选)│ │        文件管理模块              │   │  │
│  │  └─────────────┘ └─────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                      外部集成层                           │  │
│  │   Gemini API │ Serper API │ Qdrant │ D1 │ R2            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**架构特点**：
- **无服务器**：Worker 按请求计费，自动扩缩。
- **分层清晰**：网关、服务层、数据层分离，便于维护和扩展。
- **工具注入与子代理规划**：通过 Gemini 的函数调用能力实现，核心逻辑封装在工具调用模块。
- **抽象解耦**：LLM、向量数据库、关系数据库均通过接口抽象，便于替换实现。
- **高级推理支持（可选）**：TOT/GOT 供复杂推理场景使用，**非 PRD v1.1 必验收项**，建议 feature flag 控制。
- **文件管理**：集成 R2 存储、分片上传、进度反馈、RAG 处理。

---

## 3. 模块划分

| 模块 | 职责 | 关键类/文件 |
|------|------|-------------|
| **用户管理模块** | 用户信息、AI昵称的存储与获取 | `UserRepository`, `api/user.ts` |
| **对话管理模块** | 接收用户消息，调用 LLM，处理工具调用，返回回复；意图识别与 Prompt 选择；**按会话加载历史**、**首轮资料缺口**、**自动标题**；**首轮工具收窄**（事实检索 / 找图 / 高德路线 / 任务写入等，见 §9.1.1） | `ChatService`, `detect-factual-web-search-intent.ts`, `api/chat.ts`, `IntentClassifier` |
| **会话模块** | 会话 CRUD、列表、按会话分页消息、标题更新 | `SessionRepository`, `api/sessions.ts` |
| **认证模块** | 匿名昵称登录、JWT 签发、名称唯一性校验 | `api/auth.ts`, `AuthService`（或与 `UserRepository` 合并） |
| **任务管理模块** | 任务 CRUD；可选项目分组（**超出 PRD v1.1，可关闭**） | `TaskRepository`, `ProjectRepository`, `api/tasks.ts` |
| **记忆召回模块** | 向量检索历史对话、上传文档，注入上下文 | `MemoryService`, `VectorStore` |
| **工具调用模块** | 注册与执行所有可用工具（含 `manage_workspace_files`） | `ToolRegistry`, `tools/*.ts` |
| **子代理规划模块** | 深度研究等复杂任务的分解与协调 | `PlannerService` |
| **TOT/GOT 模块** | 树/图思考模式（**PRD 外可选**，默认可关闭以降低延迟与成本） | `TotService`, `GotService` |
| **文件管理模块** | 文件上传、存储、元数据管理、RAG 处理、进度反馈 | `FileService`, `api/files.ts`, `FileProcessor` |
| **Prompt 管理模块** | 管理场景化 Prompt 模板，支持按意图选择 | `PromptRepository`, `api/prompts.ts` |
| **LLM 抽象层** | 封装不同 AI 模型调用 | `LLMProvider`, `GeminiProvider` |
| **向量存储抽象层** | 封装向量数据库操作 | `VectorStore`, `QdrantStore` |
| **关系数据库抽象层** | 使用 Drizzle ORM 操作 D1 | `db/schema.ts`, `db/repositories/*` |

---

## 4. 数据存储设计

### 4.1 关系型数据库（Cloudflare D1）

#### ER 图（简化）
```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │   tasks     │       │  projects   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │◄──────│ user_id (FK)│       │ id (PK)     │
│ name        │       │ project_id  │───────│ user_id (FK)│
│ email       │       │ title       │       │ name        │
│ ai_nickname │       │ description │       │ created_at  │
│ prefs_json  │       │ detail_json │       └─────────────┘
│ created_at  │       │ status      │
└─────────────┘       │ created_at  │
       │               │ updated_at  │
       │               └─────────────┘
       │
       ▼
┌─────────────────┐       ┌─────────────────┐
│  chat_sessions  │       │  conversations  │  ← 消息行（按 session 隔离）
├─────────────────┤       ├─────────────────┤
│ id (PK)         │◄──────│ session_id (FK) │
│ user_id (FK)    │       │ id (PK)         │
│ title           │       │ user_id (FK)    │
│ created_at      │       │ role            │
│ updated_at      │       │ content         │
└─────────────────┘       │ created_at      │
                          │ intention       │
                          │ prompt_id (FK)  │
                          │ keywords        │
                          │ conversation_id │  ← 助手行关联用户消息 id（行级）
                          └─────────────────┘

┌─────────────────┐
│   file_uploads  │
├─────────────────┤
│ id (PK)         │
│ user_id (FK)    │
│ …               │
└─────────────────┘

┌─────────────────┐
│ serper_usage    │
├─────────────────┤
│ user_id + day   │
│ call_count      │
└─────────────────┘

┌─────────────────┐
│   prompt_templates   │
├─────────────────┤
│ id (PK)         │
│ name            │
│ template_text   │
│ scenario        │
│ created_at      │
└─────────────────┘
```

#### 表结构详细定义

**users**（PRD v1.2：匿名昵称登录）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL, **UNIQUE** | **显示名称／登录名**，全库唯一，与 PRD「匿名登录」一致 |
| email | TEXT | UNIQUE, **NULL 允许** | 可选；未填时由首轮对话引导补全（见 §8.1、PRD 2.2） |
| ai_nickname | TEXT | DEFAULT '助手' | AI 昵称 |
| preferences_json | TEXT | NULL | 用户偏好（JSON），如回复风格、习惯等，供长期记忆与 Prompt 注入 |
| created_at | INTEGER | NOT NULL | Unix 时间戳 |

> **迁移注意**：若存量库中 `email` 为 `NOT NULL`，需迁移为可空并处理占位数据；`users.name` 须加唯一索引。

**chat_sessions**（会话 / 线程，PRD v1.2）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| user_id | TEXT | NOT NULL, FK | 所属用户 |
| title | TEXT | NOT NULL | 展示标题；新建时可用默认文案（如「新对话」），首轮完成后可被模型改写 |
| title_source | TEXT | NOT NULL DEFAULT 'auto' | `auto` 系统生成 / `user` 用户右键重命名覆盖 |
| created_at | INTEGER | NOT NULL | |
| updated_at | INTEGER | NOT NULL | 列表排序、重命名时更新 |

**projects**
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| user_id | TEXT | NOT NULL, FK | 所属用户 |
| name | TEXT | NOT NULL | 项目名称 |
| created_at | INTEGER | NOT NULL | 创建时间 |

**tasks**
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| user_id | TEXT | NOT NULL, FK | 所属用户 |
| project_id | TEXT | NULL, FK | 所属项目 |
| title | TEXT | NOT NULL | 任务标题 |
| description | TEXT | NULL | 详细描述/备注（纯文本） |
| detail_json | TEXT | NULL | 结构化详情（JSON）：子任务列表、分条备注等，对应 PRD「细化需求」 |
| status | TEXT | NOT NULL DEFAULT 'pending' | pending, in_progress, completed |
| created_at | INTEGER | NOT NULL | |
| updated_at | INTEGER | NOT NULL | |

**prompt_templates**
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 模板名称（如 default, resume_interview, task_management） |
| template_text | TEXT | NOT NULL | 系统提示词模板，包含变量 {{USER_NAME}} 等 |
| scenario | TEXT | NOT NULL | 场景标识（default, interview, research, etc） |
| created_at | INTEGER | NOT NULL | |

**conversations**（消息表；表名保留，语义为「聊天消息行」）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| user_id | TEXT | NOT NULL, FK | 所属用户（冗余便于按用户审计；与 session 一致） |
| **session_id** | TEXT | NOT NULL, FK | **所属会话**（`chat_sessions.id`），PRD 多会话与历史加载 |
| role | TEXT | NOT NULL | 'user' 或 'assistant' |
| content | TEXT | NOT NULL | 消息内容 |
| intention | TEXT | NULL | AI 判断的用户意图（如 greeting, question, task_operation, etc） |
| prompt_id | TEXT | NULL, FK | 使用的 prompt 模板 ID（仅 assistant 消息） |
| keywords | TEXT | NULL | 用户语句中的命名实体识别结果（JSON 数组） |
| conversation_id | TEXT | NULL | **行级**：助手消息指向配对的**用户消息行** `id` |
| created_at | INTEGER | NOT NULL | |

说明：
- `intention` 由 AI 在生成回答时判断并记录，用于后续分析和优化。
- `prompt_id` 记录本次回答使用了哪个 prompt 模板。
- `keywords` 存储从用户输入中提取的实体（如姓名、任务名称等），格式为 JSON 字符串。
- `conversation_id`：对于用户消息，该字段为 NULL；对于 AI 回复，该字段指向对应的用户消息行的 `id`，方便追溯。
- **`session_id` 与 API**：流式接口请求体中的 **`session_id`** 即本字段；列表与历史接口均按 `session_id` 过滤。

**file_uploads**
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| user_id | TEXT | NOT NULL, FK | 所属用户 |
| filename | TEXT | NOT NULL | 存储的文件名（如 UUID.pdf） |
| original_name | TEXT | NOT NULL | 用户原始文件名 |
| mime_type | TEXT | NOT NULL | MIME 类型（如 application/pdf） |
| size | INTEGER | NOT NULL | 文件大小（字节） |
| r2_key | TEXT | NOT NULL | 在 R2 中的存储路径 |
| semantic_type | TEXT | NULL | 用户标记的语义类型（简历、学习资料、小抄等） |
| folder_path | TEXT | NOT NULL DEFAULT '' | 工作空间内逻辑路径（如 `学习资料/2024`），根目录为空字符串；与 `GET /api/workspace?folder=` 前缀匹配 |
| tags | TEXT | NULL | 标签 JSON 数组字符串，如 `["important"]`，支持对话中「标记为重要」等指令 |
| processed | INTEGER | NOT NULL DEFAULT 0 | 异步处理状态：`0` 未处理或处理中，`1` 已向量化写入 Qdrant，`-1` 文本提取或向量化失败（仍可下载，可重试） |
| created_at | INTEGER | NOT NULL | 上传时间 |

**serper_usage**（Serper 调用计数，满足 PRD 成本与频率控制）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| user_id | TEXT | NOT NULL, PK(复合) | 用户 |
| day | TEXT | NOT NULL, PK(复合) | UTC 日期 `YYYY-MM-DD` |
| call_count | INTEGER | NOT NULL DEFAULT 0 | 当日已成功调用 Serper 的次数 |

主键：`(user_id, day)`。每次 `search` / 深度研究内实际命中 Serper 成功返回时递增；超过软阈值时由 `SearchTool` 或 `PlannerService` 返回友好提示，必要时在回复中询问用户是否继续（与 PRD 2.6.2-6 一致）。

### 4.2 向量数据库（Qdrant）

**Collection**: `memory`  
**向量维度**: 与所选 **Gemini（或替代）Embedding 模型**输出维度一致（文档示例沿用 768，**集成前务必按官方文档核对并配置**）  
**距离度量**: Cosine  

**Payload 结构**:
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户标识 |
| type | string | 'conversation' 或 'document' |
| source | string | 原始文本片段 |
| timestamp | integer | 时间戳 |
| file_id | string | 关联 file_uploads.id（若为文档） |
| semantic_type | string | 用户标记的语义类型（便于过滤） |
| folder_path | string | 可选，与 D1 中文件记录一致，便于按目录过滤 |
| tags | string[] | 可选，从 `file_uploads.tags` 解析 |

### 4.3 时间字段设计说明

所有时间字段（`created_at`、`updated_at`）均使用 **INTEGER** 类型存储 **Unix 时间戳（秒级）**。选择理由：
- **业务精度足够**：任务创建、更新等场景对时间精度要求到秒即可满足需求。
- **存储与索引效率**：秒级时间戳占用 4 字节，比毫秒级节省空间，索引性能更优。
- **API 兼容性**：Gemini、Serper 等外部 API 返回的时间字段通常为秒级 Unix 时间戳，便于直接存储和比较。
- **跨语言一致性**：JavaScript 中 `Math.floor(Date.now() / 1000)` 可轻松获得秒级时间戳。

若未来需要毫秒级精度，可采用以下扩展方案：
- **方案一**：将字段类型改为 `BIGINT` 直接存储毫秒时间戳（`Date.now()`）。
- **方案二**：保留秒级字段，增加一个 `ms_offset` 字段（SMALLINT，0~999）存储毫秒偏移，实现毫秒精度且保持索引高效。

当前版本按秒级设计，后续可根据实际需求灵活升级。

### 4.4 数据库迁移脚本（D1）

数据库迁移使用 `wrangler d1 migrations` 管理。所有迁移文件存放在 `src/db/migrations/` 目录下，按时间顺序编号。以下是每个迁移文件的内容。

### 迁移 0001：创建 users 表

**文件**：`0001_create_users.sql`

```sql
-- 创建 users 表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  ai_nickname TEXT NOT NULL DEFAULT '助手',
  created_at INTEGER NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

---

### 迁移 0002：创建 projects 表

**文件**：`0002_create_projects.sql`

```sql
-- 创建 projects 表
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
```

---

### 迁移 0003：创建 tasks 表

**文件**：`0003_create_tasks.sql`

```sql
-- 创建 tasks 表
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
```

---

### 迁移 0004：创建 prompt_templates 表

**文件**：`0004_create_prompt_templates.sql`

```sql
-- 创建 prompt_templates 表
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_text TEXT NOT NULL,
  scenario TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_prompt_templates_scenario ON prompt_templates(scenario);

-- 插入默认模板
INSERT INTO prompt_templates (id, name, template_text, scenario, created_at)
VALUES (
  'default_prompt',
  'default',
  '你是一个智能任务管理助手，昵称为“{{AI_NICKNAME}}”。你的职责是：\n1. 记住用户信息（姓名、邮箱），并在对话中自然称呼用户。\n2. 帮助用户管理任务列表（增删改查），支持通过自然语言对话完成操作。\n3. 当用户询问实时信息或需要外部知识时，调用 search 工具获取结果。\n4. 对于复杂研究任务，使用 plan_research 工具进行深度研究。\n5. 当用户要求通过对话管理工作空间文件（删除、重命名、改语义类型、打标签等）时，调用 manage_workspace_files 工具。\n6. 始终以友好、专业的语气回复。\n\n当前用户信息：\n- 姓名：{{USER_NAME}}\n- 邮箱：{{USER_EMAIL}}\n\n可用工具列表（以 JSON Schema 形式提供）：\n{{TOOLS_DEFINITIONS}}',
  'default',
  strftime('%s', 'now')
);
```

---

### 迁移 0005：创建 conversations 表

**文件**：`0005_create_conversations.sql`

```sql
-- 创建 conversations 表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intention TEXT,
  prompt_id TEXT,
  keywords TEXT,
  conversation_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_id) REFERENCES prompt_templates(id) ON DELETE SET NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_intention ON conversations(intention);
```

---

### 迁移 0006：创建 file_uploads 表

**文件**：`0006_create_file_uploads.sql`

```sql
-- 创建 file_uploads 表
CREATE TABLE IF NOT EXISTS file_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  semantic_type TEXT,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_files_user_created ON file_uploads(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_files_semantic_type ON file_uploads(semantic_type);
```

---

### 迁移 0007：PRD 对齐字段与 Serper 用量表

**文件**：`0007_prd_alignment.sql`

```sql
-- 用户偏好（长期记忆结构化落库，与 PRD 2.7 一致）
ALTER TABLE users ADD COLUMN preferences_json TEXT;

-- 任务子任务/结构化详情（与 PRD 2.3-5 一致）
ALTER TABLE tasks ADD COLUMN detail_json TEXT;

-- 工作空间路径与标签（与 PRD 2.5.1、对话「标记重要」等一致）
ALTER TABLE file_uploads ADD COLUMN folder_path TEXT NOT NULL DEFAULT '';
ALTER TABLE file_uploads ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_files_user_folder ON file_uploads(user_id, folder_path);

-- Serper 按用户按日计数（与 PRD 2.6.2-6 一致）
CREATE TABLE IF NOT EXISTS serper_usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
```

> 若生产环境已在 0001–0006 上跑过数据，**仅追加** `0007` 即可；新建库可后续将 0001–0007 合并为单次初始化脚本（按团队规范选择）。

---

### 迁移 0008：多会话、匿名用户邮箱可空（PRD v1.2）

**文件**：`0008_chat_sessions_and_messages.sql`

```sql
-- 会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_source TEXT NOT NULL DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);

-- 消息归属会话：新增列（存量数据须回填默认会话后再设 NOT NULL）
ALTER TABLE conversations ADD COLUMN session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE;
-- 部署脚本应对每用户插入占位会话并 UPDATE conversations SET session_id = ... WHERE session_id IS NULL;

-- 用户：显示名唯一；邮箱可空（SQLite 允许多个 NULL UNIQUE）
-- 注意：已存在数据需先处理重复 name、补全 email 再执行下列约束（按环境编写一次性脚本）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_unique ON users(name);
-- 若原 email 为 NOT NULL，需：ALTER 或重建表使 email 可空（D1/SQLite 用迁移工具生成具体步骤）
```

> **回填策略（存量）**：为每个 `user_id` 至少创建一个 `chat_sessions` 行，将所有历史 `conversations` 行 `session_id` 指向该默认会话，避免再登录后「历史空白」。新实现应在用户首次发消息前即创建会话并与前端 `session_id` 对齐。

---

### 执行迁移

在本地或 CI 中，使用以下命令应用迁移：

```bash
# 创建数据库（如果尚未创建）
wrangler d1 create task-assistant-db

# 应用迁移
wrangler d1 migrations apply task-assistant-db
```

迁移文件应按顺序执行，确保依赖关系正确。每次修改表结构时，需创建新的迁移文件（如 `0007_add_xxx.sql`），并保持编号递增。

---

以上迁移脚本完整定义了 D1 数据库的所有表结构，包括索引、外键约束和默认数据（如默认 Prompt 模板）。

### 4.5 上传文件类型与 RAG 处理策略

与 PRD 2.5.2、2.5.4 对齐，避免「凡上传必可向量化」的误解：

| 类型 | 处理策略 |
|------|----------|
| PDF、Word（doc/docx）、纯文本 / Markdown | 提取文本 → 分块 → Embedding → 写入 Qdrant；`processed` 最终为 `1` 或失败 `-1` |
| Excel（xlsx 等） | **v1.1**：优先提取单元格文本（只读、行数上限可配置）；若解析失败则仅存储文件供下载，`processed = -1` 并提示 |
| 图片 | **v1.1 可选**：OCR（如云端 API）后再向量化；未启用 OCR 时仅存储 + 元数据检索，不向量化 |
| 音频 / 视频 | **不向量化全文**：仅存 R2 + `file_uploads` 元数据；对话中可通过文件名、`semantic_type`、`folder_path` 被模型引用；若后续接入转写服务，再在异步流水线中追加向量 |
| 其他 MIME | 安全校验后存储；不向量化 unless 明确支持 |

系统在 `FileService` / `FileProcessor` 中按 `mime_type` 分支；**异步队列**完成提取与 `processed` 状态更新，与第 11.3 节流程一致。

---

## 5. API 接口设计

除 **§5.0 认证** 外，接口返回 JSON 时需携带 `Authorization: Bearer <token>`（简化实现可使用 session）。

### 5.0 认证接口（匿名昵称登录）

**POST /api/auth/login**

请求体：
```json
{
  "name": "用户在首页输入的显示名称，全库唯一",
  "email": "可选，可省略或 null"
}
```

响应示例：
```json
{
  "token": "jwt...",
  "user": {
    "id": "uuid",
    "name": "显示名称",
    "email": null,
    "ai_nickname": "助手"
  },
  "is_new_user": true
}
```

- **`is_new_user`**：`true` 表示本次请求**新创建**了用户记录，前端主按钮对应 PRD「开始吧」；`false` 表示该名称**已对应存量用户**、本次为再次登录，对应「欢迎回来」。
- **同名即同账号**：PRD「全库去重」指 **一名称最多绑定一个用户**；`POST /api/auth/login` 在名称已存在时**直接登录该用户**（`is_new_user: false`），**不**因「重名」返回 409。若未来增加「名称占用但未完成 onboarding」等状态机，再单独定义 409。
- **实现要点**：注册与登录合一；无密码；JWT `sub` = `user.id`。名称即身份，需知悉低门槛场景的冒名风险，后续可加 PIN/设备绑定等增强（非 v1.2 必验收）。

**GET /api/auth/profile-exists?name=**（可选）

响应：`{ "exists": true }` 表示该名称已对应用户（前端可提前切换主按钮为「欢迎回来」）；`{ "exists": false }` 表示首次创建（「开始吧」）。**不签发 token**，仅减少点击前认知摩擦。

---

### 5.1 对话接口（SSE 流式）

**POST /api/chat/stream**

请求体：
```json
{
  "message": "用户输入",
  "session_id": "必填，UUID，对应当前侧边栏选中的会话"
}
```

- 服务端须校验 **`session_id` 属于当前用户**，否则 403/404。
- 流式处理结束后：若该会话刚完成**首条 user + 首条 assistant** 成对写入，且 `title_source = 'auto'`，则异步调用 **标题生成**（轻量 LLM 或规则摘要用户首句），`UPDATE chat_sessions SET title = ?, updated_at = ?`；若 `title_source = 'user'` 则跳过。

### 5.1.1 会话（线程）与历史消息

**GET /api/sessions** → 当前用户的会话列表（按 `updated_at` 降序）

```json
[
  { "id": "uuid", "title": "项目周报要点", "created_at": 1710000000, "updated_at": 1710000100 }
]
```

**POST /api/sessions** → 创建空会话（可选；也可由首次发消息时懒创建）

响应：`{ "id": "uuid", "title": "新对话", ... }`

**GET /api/sessions/:sessionId/messages?cursor=&limit=** → 分页拉取该会话消息，**供进入会话或再登录后渲染**；顺序按 `created_at` 升序。

**PATCH /api/sessions/:sessionId** → 重命名

```json
{ "title": "用户输入的新标题" }
```

成功后置 `title_source = 'user'`（避免自动标题覆盖用户文案）。

**DELETE /api/sessions/:sessionId**（可选）→ 软删或硬删会话及其消息，按产品策略。

响应：`Content-Type: text/event-stream`

事件格式（**与 PRD 2.1-4「悬停查看原始数据」对齐**：除正文 token 外，下发结构化引用块供前端渲染 `<search>` / `<rag>` 及 Tooltip）：
```
event: token
data: {"content":"正在思考"}

event: tool_call
data: {"name":"search","args":{...}}

event: tool_result_meta
data: {"tool":"search","items":[{"title":"...","url":"...","snippet":"...","date":null}],"raw_ref":"可选，指向服务端缓存键或截断 JSON"}

event: citation
data: {"kind":"rag","file_id":"...","filename":"...","semantic_type":"简历","excerpt":"检索片段预览","score":0.82}

event: intention
data: {"intention":"greeting"}

event: done
data: {}
```

约定说明：

- **`tool_result_meta`**：在对应 `tool_call` 执行完成、且工具为 `search`（或同类）后发送，便于 UI 悬停展示来源与摘要，**不依赖用户从纯文本里猜 JSON**。
- **`citation`**：在 RAG 检索命中后发送（可一条或多条），与最终 assistant 正文中的 `<rag source="file" data='...'>` 对应；前端可用 `file_id` 拉取更多元数据或预览。
- 若需减少 SSE 条数，可将 `citation` 合并为单次 `event: citations` + JSON 数组，但需在前后端统一类型定义。

在流式响应中，可额外发送 `intention` 事件，告知前端 AI 判断的用户意图。

### 5.2 用户信息接口

**GET /api/user** → 返回当前用户
```json
{ "id": "xxx", "name": "李明", "email": "li@example.com", "ai_nickname": "小研", "preferences": { "reply_style": "简洁" } }
```
（`email` 可为 `null`；`preferences` 来自 `users.preferences_json` 解析，无则省略或 `{}`。）

**PUT /api/user** → 更新
```json
{ "name": "李小明", "email": "new@example.com", "preferences": { "reply_style": "简洁" } }
```

**PUT /api/user/ai-name** → 设置 AI 昵称
```json
{ "nickname": "星尘" }
```

### 5.3 任务接口

**GET /api/tasks?status=pending** → 任务列表
**POST /api/tasks** → 创建
```json
{ "title": "完成报告", "description": "详细内容", "detail": { "subtasks": [{ "title": "提纲", "done": false }] }, "status": "pending" }
```
（`detail` 可选，对应表字段 `detail_json`。）
**PUT /api/tasks/:id** → 更新
**DELETE /api/tasks/:id** → 删除

### 5.4 文件管理接口

#### 5.4.1 获取文件列表

**GET /api/workspace**

查询参数：
- `folder`（可选）：逻辑路径前缀，与 `file_uploads.folder_path` 匹配（根目录传空或不传）；**v1.1 为扁平路径字符串**，非树形 inode，后续可演进为独立文件夹表。
- `type`（可选）：按语义类型过滤

响应：
```json
[
  {
    "id": "xxx",
    "filename": "resume.pdf",
    "original_name": "我的简历.pdf",
    "mime_type": "application/pdf",
    "size": 245760,
    "semantic_type": "简历",
    "folder_path": "简历",
    "tags": ["important"],
    "created_at": 1678896000,
    "processed": 1
  }
]
```
`processed` 数值语义同表定义：`0` / `1` / `-1`。

#### 5.4.2 上传文件（支持分片）

**POST /api/files/upload**

请求类型：`multipart/form-data`（小文件）或 `application/json`（大文件初始化）

- 小文件（≤5MB）：`multipart` 字段包含 `file`、`semantic_type`，可选 `folder_path`、`tags`（JSON 字符串）。
- 大文件：先调用初始化接口，获得 uploadId 和预签名分片 URL，再按分片上传。

初始化接口（大文件）：
**POST /api/files/initiate-multipart**
```json
{
  "filename": "resume.pdf",
  "original_name": "我的简历.pdf",
  "mime_type": "application/pdf",
  "size": 245760,
  "semantic_type": "简历",
  "folder_path": "简历",
  "tags": ["important"]
}
```
返回：
```json
{
  "upload_id": "xxx",
  "r2_key": "xxx",
  "part_urls": ["https://...?partNumber=1", "https://...?partNumber=2", ...]
}
```

前端按顺序上传每个分片到对应 URL，然后调用完成接口。

**POST /api/files/complete-multipart**
```json
{
  "upload_id": "xxx",
  "r2_key": "xxx",
  "parts": [{ "etag": "xxx", "partNumber": 1 }]
}
```
返回：`{ "id": "xxx", "message": "上传完成" }`

#### 5.4.3 上传进度反馈

前端可以通过以下方式获取上传进度：
- **XMLHttpRequest 的 `upload.onprogress`**：直接监听分片上传的进度事件，计算已上传字节数占总文件比例。
- **SSE 推送**：在后端处理分片上传时，可通过 WebSocket 或 SSE 推送每个分片完成的事件。但考虑到简化，推荐前端直接计算（因分片上传是前端直接发到 R2 预签名 URL，后端不参与数据流）。因此，前端在调用 `uploadPart` 时，可以通过 XMLHttpRequest 的 progress 事件获得每个分片的进度，累积得到总进度。
- 对于小文件上传（≤5MB），也可使用 `fetch` 的 `ReadableStream` 或 `XMLHttpRequest` 获取进度。

在 UI 上，前端展示进度条，并在所有分片完成后调用完成接口。

#### 5.4.4 删除文件

**DELETE /api/files/:id**

返回：`{ "message": "删除成功" }`

#### 5.4.5 重命名文件

**PUT /api/files/:id/rename**

请求体：`{ "new_name": "新名字.pdf" }`

返回：更新后的文件信息

#### 5.4.6 更新语义类型

**PUT /api/files/:id/semantic-type**

请求体：`{ "semantic_type": "学习资料" }`

返回：更新后的文件信息

#### 5.4.7 更新标签（重要标记等）

**PUT /api/files/:id/tags**

请求体：`{ "tags": ["important"] }`（覆盖式写入；对话侧由 `manage_workspace_files` 工具调用此逻辑。）

返回：更新后的文件信息

#### 5.4.8 获取下载链接

**GET /api/files/:id/download**

返回：`{ "url": "https://...?signature=xxx" }`（签名URL，有效期1小时）

---

### 5.5 Prompt 模板管理接口（可选，供管理员使用）

**GET /api/prompts** → 返回所有模板列表

**POST /api/prompts** → 创建新模板

**PUT /api/prompts/:id** → 更新模板

**DELETE /api/prompts/:id** → 删除模板

---

## 6. 核心抽象设计

### 6.1 LLM 提供者抽象

**接口定义**（`src/llm/llm-provider.ts`）：
```typescript
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LLMResponse {
  content: string;
  tool_calls?: ToolCall[];
}

export interface LLMProvider {
  chat(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse & { usage: TokenUsage }>;
  streamChat(messages: LLMMessage[], tools?: ToolDefinition[]): ReadableStream;
  embed(text: string): Promise<number[]>;
}
```

**实现示例**（`src/llm/gemini-provider.ts`）：
```typescript
export class GeminiProvider implements LLMProvider {
  constructor(private apiKey: string, private model: string = 'gemini-2.0-flash-lite') {}
  async chat(messages: LLMMessage[], tools?: ToolDefinition[]) {
    // 转换消息格式，调用 Gemini API，解析 usageMetadata 并返回
  }
  // ...
}
```

**模型切换**：通过环境变量 `LLM_MODEL` 传入不同模型标识（如 `gemini-2.0-flash-lite`、`gpt-4o-mini`）。

### 6.2 向量数据库抽象

**接口定义**（`src/vector/vector-store.ts`）：
```typescript
export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

export interface VectorStore {
  upsert(points: VectorPoint[]): Promise<void>;
  search(vector: number[], filter?: Record<string, any>, limit?: number): Promise<VectorPoint[]>;
  delete(ids: string[]): Promise<void>;
}
```

**实现示例**（`src/vector/qdrant-store.ts`）：
```typescript
export class QdrantStore implements VectorStore {
  constructor(private client: QdrantClient, private collection: string) {}
  // ...
}
```

### 6.3 关系数据库抽象（Drizzle ORM）

**Schema 定义**（`src/db/schema.ts`）：
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  aiNickname: text('ai_nickname').default('助手'),
  createdAt: integer('created_at').notNull(),
});
// ...
```

**使用**：
```typescript
import { drizzle } from 'drizzle-orm/d1';
const db = drizzle(env.DB);
const user = await db.select().from(users).where(eq(users.email, email));
```

### 6.4 文件存储抽象

为了便于替换存储后端（如从 R2 迁移到 S3），定义抽象接口：

```typescript
// src/storage/file-storage.ts
export interface FileStorage {
  upload(key: string, data: ArrayBuffer, options?: any): Promise<{ etag: string }>;
  download(key: string): Promise<ArrayBuffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  initiateMultipartUpload(key: string): Promise<{ uploadId: string }>;
  uploadPart(key: string, uploadId: string, partNumber: number, data: ArrayBuffer): Promise<{ etag: string }>;
  completeMultipartUpload(key: string, uploadId: string, parts: { etag: string; partNumber: number }[]): Promise<void>;
}
```

R2 实现将利用 Cloudflare 的 `@cloudflare/workers-types` 和 `R2Bucket`。

---

## 7. Prompt 模板与场景化设计

### 7.1 设计思路

为了适应不同对话场景（如任务管理、面试模拟、深度研究），系统支持多套 Prompt 模板，并根据用户意图动态选择。

### 7.2 模板存储

模板存储在 D1 的 `prompt_templates` 表中，包含以下字段：
- `id`：UUID
- `name`：模板名称（如 "default", "interview", "research"）
- `scenario`：场景标识（default, interview, task_management, research）
- `template_text`：提示词模板，支持变量替换（如 `{{USER_NAME}}`、`{{AI_NICKNAME}}`）
- `created_at`：创建时间

### 7.3 意图识别与模板选择

在对话处理流程中，增加一个轻量级意图识别步骤：

1. **快速意图识别**：可以使用规则匹配（关键词）或调用轻量级分类模型（如 Gemini Flash 快速调用）判断用户意图类别。为了简化，1.0 版本可采用规则 + 简单 LLM 调用（例如单独发送一条消息判断意图），但会增加延迟。另一种方案是在系统提示中要求 LLM 返回 `intention` 字段，并同时生成回答，但需要 LLM 支持结构化输出。

   实现方式：在调用 LLM 生成回答时，系统提示中要求 LLM 以 JSON 形式返回意图和最终回复，例如：

   ```json
   {
     "intention": "greeting",
     "reply": "你好！..."
   }
   ```

   这样一次调用即可完成意图识别和内容生成。我们采用此方式，避免额外 API 调用。

2. **模板选择**：根据返回的 `intention`，从数据库中查询对应的 `prompt_template`。若未找到特定场景模板，则使用 `scenario='default'` 的模板。

3. **模板渲染**：将用户信息（姓名、AI昵称）等变量注入模板，得到最终的 system prompt。

### 7.4 模板示例

**default**:
```markdown
你是一个智能任务管理助手，昵称为“{{AI_NICKNAME}}”。你的职责是：
1. 记住用户信息（姓名、邮箱），并在对话中自然称呼用户。
2. 帮助用户管理任务列表（增删改查），支持通过自然语言对话完成操作。
3. 当用户询问实时信息或需要外部知识时，调用 search 工具获取结果。
4. 对于复杂研究任务，使用 plan_research 工具进行深度研究。
5. 当用户要求通过对话管理工作空间文件（删除、重命名、改语义类型、打标签等）时，调用 manage_workspace_files 工具。
6. 始终以友好、专业的语气回复。

当前用户信息：
- 姓名：{{USER_NAME}}
- 邮箱：{{USER_EMAIL}}

可用工具列表（以 JSON Schema 形式提供）：
{{TOOLS_DEFINITIONS}}
```

**interview**:
```markdown
你是一个专业的面试官，昵称为“{{AI_NICKNAME}}”。请扮演面试官角色，对用户进行技术面试。你需要：
1. 根据用户提供的简历和岗位描述，提出针对性问题。
2. 在用户回答后，给出点评和优化建议。
3. 保持专业、鼓励的语气。

当前用户信息：
- 姓名：{{USER_NAME}}
- 邮箱：{{USER_EMAIL}}
```

### 7.5 实现细节

在 `ChatService` 中增加 `selectPrompt` 方法：

```typescript
private async selectPrompt(intention: string): Promise<PromptTemplate> {
  const prompt = await this.db.select().from(promptTemplates)
    .where(eq(promptTemplates.scenario, intention))
    .limit(1);
  if (prompt.length) return prompt[0];
  // fallback to default
  return await this.db.select().from(promptTemplates)
    .where(eq(promptTemplates.scenario, 'default'))
    .limit(1);
}
```

在构建消息时，先调用 LLM 获取 intention 和回答（如果模型支持一次性输出），然后选择模板，再重新调用 LLM（或复用结果）。为避免两次调用，可以在第一次调用时要求模型同时返回 intention 和 reply，但工具调用可能被中断。权衡后，我们选择第一次调用仅用于意图识别（成本低，可使用快速模型），第二次用于实际回答。但为了性能，可在第一次调用时让模型仅返回意图类别（例如通过函数调用或限定输出格式），这样可节省 token。

鉴于复杂度，1.0 版本简化处理：始终使用默认模板，但在对话记录中记录 intention 字段，供后续分析。

---

## 8. LLM 调用核心设计

### 8.1 Prompt 设计（更新）

采用动态模板渲染，支持多场景。在调用 LLM 前，根据意图选择模板并渲染。

#### 8.1.1 系统提示词（System Prompt）

系统提示词定义了 AI 助手的角色、能力边界、行为规范以及可用工具。我们将其设计为可配置的模板，支持根据用户偏好（如 AI 昵称）动态替换。

**模板示例**（存储在 D1 或环境变量中）：
```markdown
你是一个智能任务管理助手，昵称为“{{AI_NICKNAME}}”。你的职责是：
1. 记住用户信息（姓名、邮箱），并在对话中自然称呼用户。
2. 帮助用户管理任务列表（增删改查），支持通过自然语言对话完成操作。
3. 当用户询问实时信息或需要外部知识时，调用 search 工具获取结果。
4. 对于复杂研究任务，使用 plan_research 工具进行深度研究。
5. 当用户要求通过对话管理工作空间文件（删除、重命名、改语义类型、打标签等）时，调用 manage_workspace_files 工具。
6. 始终以友好、专业的语气回复。

当前用户信息：
- 姓名：{{USER_NAME}}
- 邮箱：{{USER_EMAIL}}

可用工具列表（以 JSON Schema 形式提供）：
{{TOOLS_DEFINITIONS}}
```

**构建时机**：每次对话前，`ChatService` 从数据库读取用户信息和 AI 昵称，替换模板变量，并通过 `LLMProvider` 的 `chat` 或 `streamChat` 方法传递系统提示。

**资料缺口与首轮询问（PRD v1.2 §2.2-4）**：在拼装 system 或首条 developer 指令时注入结构化片段，例如：

- `USER_DISPLAY_NAME`：登录名（必有）与「用户愿意被称呼的姓名」可能尚未区分时，在模板中说明二者关系。
- `PROFILE_GAPS`：若 `email` 为空或 `name` 仅为登录占位、未确认称呼名，则列出缺失项。

并要求模型：**在当前会话中，若本回合是用户的第一条消息之后的首条助手回复**，则在回答用户实质问题的同时，用简短自然语句**询问缺失资料**（缺邮箱则问邮箱，缺可称呼姓名则问希望如何称呼）；已齐全则禁止重复盘问。

实现上可在 `ChatService` 内根据 `session_id` 查询该会话是否已有任何 `role=assistant` 行；若无，则置 `isFirstAssistantTurn = true` 并注入上述约束。

#### 8.1.2 用户消息与工具调用消息的格式

为保持与 OpenAI 函数调用格式兼容，我们统一使用以下消息结构：

- **用户消息**：`{ role: "user", content: userInput }`
- **助手消息（含工具调用）**：
  ```json
  {
    "role": "assistant",
    "content": null,
    "tool_calls": [
      { "id": "call_123", "type": "function", "function": { "name": "search", "arguments": "{\"query\":\"...\"}" } }
    ]
  }
  ```
- **工具响应消息**：
  ```json
  {
    "role": "tool",
    "tool_call_id": "call_123",
    "content": "工具返回的 JSON 字符串"
  }
  ```

#### 8.1.3 提示词模板管理

使用轻量级模板引擎（如 `mustache` 或手写替换）实现模板渲染。模板存储在 D1 的 `prompt_templates` 表中，支持热更新。

```typescript
// src/utils/prompt.ts
export function renderSystemPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}
```

### 8.2 Context 设计

上下文由三部分构成：**系统提示**、**短期记忆（对话历史）**、**长期记忆（RAG 检索片段）**。

#### 8.2.1 短期上下文（会话消息历史）

- 存储：使用 `conversations` 表，**按 `session_id` 过滤**，仅加载当前线程消息。
- 策略：保留该会话内最近 N 轮（默认 10 轮），避免超出模型上下文窗口。当历史超过限制时，可进行 **摘要压缩**（调用 LLM 生成摘要后替换早期消息）。
- **再登录**：不依赖 Worker 内存；历史一律从 D1 按 `session_id` 读取，与 PRD「退出再登录历史可见」一致。

#### 8.2.2 长期记忆（RAG 检索）

在用户消息发送后，`MemoryService` 执行以下步骤：

1. 将用户输入向量化（调用 `LLMProvider.embed`）。
2. 在 Qdrant 中检索与 `user_id` 匹配且相似度 > 0.75 的 Top K（默认 3）个片段。
3. 将检索到的片段格式化为上下文消息：
   ```json
   {
     "role": "system",
     "content": "相关历史记忆：\n- 片段1\n- 片段2"
   }
   ```
4. 将该消息插入到系统提示与用户消息之间。

#### 8.2.3 上下文窗口管理

为防止超限，需计算当前构建的消息总 tokens 数（可使用 `tiktoken` 或模型 API 的 `countTokens` 方法）。若超出模型限制（如 Gemini 2.0 Flash Lite 上下文窗口为 1M tokens，基本不用担心，但仍可做防御），采取以下策略：
- 优先保留系统提示和最新消息。
- 丢弃最早的对话轮次。
- 对检索到的记忆片段进行截断（每个片段限制 500 字符）。

### 8.3 LLM 生成的评估

为了确保回复质量，我们引入多层评估机制，既包括实时验证，也包括离线分析。

#### 8.3.1 评估策略

| 评估层级 | 触发时机 | 方法 | 示例 |
|----------|----------|------|------|
| **语法/格式校验** | 收到 LLM 响应后 | 正则匹配、JSON 解析 | 检查 tool_calls 的 `arguments` 是否为合法 JSON |
| **工具调用有效性** | 执行工具前 | 校验参数是否完整、工具是否存在 | 若缺少必填参数，要求 LLM 重新生成 |
| **答案相关性** | 最终回复返回前 | 规则 + 可选 LLM-as-Judge | 检测是否包含“我不知道”等低质量信号，可触发重试 |
| **幻觉检测** | 离线（异步） | 事实校验、引用追溯 | 对于涉及外部事实的回复，可搜索验证 |

#### 8.3.2 评估实现（代码片段）

在 `ChatService` 中集成校验逻辑：

```typescript
private async validateResponse(response: LLMResponse, messages: LLMMessage[]): Promise<boolean> {
  // 1. 工具调用参数校验
  if (response.tool_calls) {
    for (const call of response.tool_calls) {
      try {
        JSON.parse(call.arguments);
      } catch {
        console.warn(`Invalid JSON in tool call: ${call.arguments}`);
        return false;
      }
    }
  }
  
  // 2. 空回复检测
  if (!response.content && (!response.tool_calls || response.tool_calls.length === 0)) {
    return false;
  }
  
  // 3. 可选：使用 LLM 评估相关性（仅当开启高可靠性模式）
  if (this.shouldEvaluateQuality(response)) {
    const quality = await this.evaluateWithLLM(messages, response);
    if (quality.score < 0.7) {
      return false;
    }
  }
  
  return true;
}
```

#### 8.3.3 离线评估与监控

将用户反馈（如“点赞/点踩”）和对话日志存储到 D1，定期运行评估任务：
- 使用 LLM-as-Judge 对历史对话进行质量评分。
- 检测高频问题（如工具调用失败、重复回答）。
- 生成报告供开发人员优化提示词或工具。

### 8.4 Tokens 消耗与成本跟踪框架

虽然当前使用免费 API，但框架需预留计费能力，并实时跟踪 tokens 消耗，以便未来切换付费模型或优化成本。

#### 8.4.1 获取 Tokens 数据

在 `LLMProvider` 实现中，从 API 响应头或响应体中提取 tokens 信息：

**Gemini API** 返回结构包含 `usageMetadata`：
```json
{
  "usageMetadata": {
    "promptTokenCount": 123,
    "candidatesTokenCount": 456,
    "totalTokenCount": 579
  }
}
```

**OpenAI API** 类似，在 `response.usage` 中。

我们在 `GeminiProvider.chat` 方法中解析并返回：

```typescript
async chat(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse & { usage: TokenUsage }> {
  const response = await fetch(...);
  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    tool_calls: this.parseToolCalls(data),
    usage: {
      promptTokens: data.usageMetadata.promptTokenCount,
      completionTokens: data.usageMetadata.candidatesTokenCount,
      totalTokens: data.usageMetadata.totalTokenCount,
    }
  };
}
```

#### 8.4.2 成本计算模型

定义价格配置（支持多种模型）：

```typescript
// src/llm/pricing.ts
export const MODEL_PRICING = {
  'gemini-2.0-flash-lite': { input: 0, output: 0 },      // 免费
  'gemini-2.0-flash': { input: 0.000000125, output: 0.000000375 }, // 示例：每 1k tokens 美元
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
};

export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (usage.promptTokens / 1000) * pricing.input + (usage.completionTokens / 1000) * pricing.output;
}
```

#### 8.4.3 跟踪与上报

在 `ChatService` 每次 LLM 调用后，将 usage 信息异步上报到埋点服务：

```typescript
private async trackTokenUsage(userId: string, model: string, usage: TokenUsage, cost: number) {
  this.analytics.trackEvent('llm_usage', {
    userId,
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCost: cost,
    timestamp: Date.now(),
  });
}
```

#### 8.4.4 聚合统计与告警

可定期（如每小时）从埋点数据中聚合各用户/总体的 tokens 消耗和成本，在控制台展示。若成本超过预设阈值（即使免费也需留意免费额度），可触发告警。

### 8.5 总结

本部分详细设计了 LLM 调用的核心环节：

- **Prompt 设计**：采用模板化系统提示，动态注入用户信息和工具定义。
- **Context 设计**：组合短期历史、长期记忆（RAG）和系统提示，并管理上下文窗口。
- **评估机制**：多层校验确保回复质量，包括格式、工具、相关性，以及离线评估。
- **成本跟踪**：完整记录 tokens 消耗，预留价格模型，支持未来切换付费模型。

这些设计确保了 LLM 调用的可维护性、可观测性和成本可控性，为产品长期迭代打下基础。


---

## 9. Agent 实现原理与无框架方案设计

本项目采用 **模型即编排** 的轻量自研 Agent 方案，核心逻辑位于 `ChatService`、`ToolRegistry`、`PlannerService` 和高级推理模块中。所有 Agent 行为由 LLM 自主决策，无需硬编码工作流。

---

### 9.1 ReAct 循环实现

现网实现为 **`ChatService.handleMessageStream()`**（SSE）；逻辑上等价于下文 while 循环，但每轮调用 **`llm.chatStream`**，且**每轮暴露给 API 的工具列表 `roundDefs` 可按策略收窄**（见 **§9.1.1**）。默认全局上限为 `MAX_REACT_ITERATIONS`（10）；**事实检索链路**下可降为 **3** 轮（见 §9.1.1）。

下文伪代码仍以同步 `handleMessage` 描述 ReAct 主干，便于阅读。

```typescript
async handleMessage(userId: string, userInput: string): Promise<LLMResponse> {
  // 1. 意图识别与模板选择
  const intention = await this.intentClassifier.classify(userInput);
  const promptTemplate = await this.promptService.selectTemplate(intention);
  const systemPrompt = this.promptService.render(promptTemplate, {
    userName: this.user.name,
    aiNickname: this.user.aiNickname,
    toolsDefinitions: JSON.stringify(this.tools.getDefinitions()),
  });

  // 2. 构建消息历史（系统提示 + 短期对话 + RAG 记忆）
  const messages = await this.buildMessages(userId, userInput, systemPrompt);

  let maxIterations = 10;
  let finalResponse: LLMResponse | null = null;
  let toolCallHistory: ToolCall[] = [];

  while (maxIterations-- > 0) {
    // 3. 调用 LLM
    const response = await this.llm.chat(messages, this.tools.getDefinitions());

    // 4. 如果没有工具调用，返回最终答案
    if (!response.tool_calls || response.tool_calls.length === 0) {
      finalResponse = response;
      break;
    }

    // 5. 执行工具调用
    const toolResults = await this.tools.executeAll(response.tool_calls);
    toolCallHistory.push(...response.tool_calls);

    // 6. 将工具结果作为新消息添加到对话中，继续循环
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    });
    messages.push(...toolResults.map(tr => ({
      role: 'tool',
      content: tr.output,
      tool_call_id: tr.id,
    })));
  }

  // 7. 保存对话记录（包含意图、模板、关键词等）
  await this.saveConversation(userId, userInput, finalResponse.content, {
    intention,
    promptId: promptTemplate.id,
    keywords: this.extractKeywords(userInput), // NER 提取，简单实现可调用 LLM
    conversationId: this.currentConversationId,
  });

  return finalResponse;
}
```

#### 9.1.1 首轮工具收窄与事实检索（Search Agent）

**产品意图**：对用户话轮中**依赖外网核对的事实**（天气实况、新闻摘要、现价/汇率、赛事、政策要点、实体客观信息等），倾向 **「先检索、再作答」**，体验上接近常用产品中「常开联网搜索」——在 **Serper 已配置**（`search` 工具已注册）的前提下，用**首轮强制 `search`** 降低模型用训练数据冒充实况的概率。

**架构取舍（重要）**：**不增加第二次独立 LLM 请求**。「Search Agent」与「主 Agent」在协议上分工明确，在实现上为**同一条 ReAct 链**中的**角色切换**：

| 阶段 | 模型视角（系统注入） | API 工具集 | `tool_choice` |
|------|----------------------|------------|----------------|
| **Round 0** | **Search Agent**：须先调用 `search`，`type` 一般为 **`organic`** | 通常**仅** `search` | **`required`** |
| **Round ≥ 1** | **主 Agent**：根据工具 JSON 判断是否已足以回答用户；不足则可再调其它工具或再次 `search` | **全量** `ToolRegistry` 定义 | 默认（由模型决定） |

工具执行结果以标准 **`role: tool`** 消息写回同一 `messages` 数组，**无需用户确认**；后续轮次自动继续，直至产出无工具调用的最终文本或触达本轮请求的上限。

**意向检测**（启发式，可迭代调宽/调严）：

- 源码：`backend/src/chat/detect-factual-web-search-intent.ts`
- **`wantsFactualWebLookup(userInput)`** = **`wantsWeatherOrRealtimeWebSearch`**（天气/环境 + 时间参照 + 问法）**或** **`wantsGeneralFactualWebLookup`**（显式查/搜、新闻数据、行情、地理/人物任职、活动展会等；排除明显创作、扮演、纯寒暄）。
- 与 **`wantsWebImageSearch`**（联网找图）、**路线高德独占**、**编排首步 Route/Task** 等**互斥**：由 `ChatService` 内布尔标志组合决定**至多一种**「首轮收窄」生效。首轮 `toolsForPrompt` / `roundDefs` 的优先顺序可记为：**高德路线独占** → **联网找图** → **事实检索** → **任务写入收窄** → 否则全量工具。

**`ChatService` 中与 Serper / 收窄相关的标志（实现时命名以代码为准）**：

- **`factualSearchForceMode`**：`SERPER` 可用且命中 `wantsFactualWebLookup`，且未被「找图强制」「高德路线独占」「编排 Task Agent / 编排路线首步独占」覆盖时，首轮仅 `search` + `tool_choice: required`。
- **`webImageSearchForceMode`**：找图场景首轮仅 `search`，且 `type` 须为 **`images`**（另有专用系统追加与 Markdown 图链白名单逻辑，与事实检索路径独立）。
- **`taskMutationForceMode`**：任务写入类首轮收窄为日历/任务工具；与事实检索强制**互斥**（同话轮若已判为事实检索优先，则本轮不强制任务收窄——复杂混合句可后续靠规则迭代）。

**系统提示与纪律**：

- 事实检索首轮追加 **`FACTUAL_SEARCH_FORCE_APPEND`**（`chat-service.ts`）：说明 Search Agent 职责、`organic` 查询构造、工具返回后切换为主 Agent、**自动多轮**、**本链路合计至多 3 轮**模型-工具循环等。
- **`formatSystemClockBlock()`**（`system-clock-block.ts`）规则 **3（b）**：在工具列表存在 `search` 时，对**依赖外网摘要的事实**要求使用 **`search`（通常 `organic`）**，并禁止「无专用 API / search 只适用于找图」类拒调借口，与首轮收窄策略一致。

**ReAct 轮次上限**：

- 全局默认仍为 **10** 轮（非事实检索链路、编排、任务强制等）。
- 当 **`factualSearchForceMode`** 为真时，本请求 **`maxReactIterationsForRequest = min(10, 3)`**（常量 `MAX_FACTUAL_SEARCH_REACT_ROUNDS`），避免在同一用户消息上无限工具循环；触顶时返回说明性兜底文案（实现为中文提示「事实检索链路轮次上限」类）。

**可观测与 SSE**：

- 调试日志：`system_prompt_built` / `llm_stream_request` 等可带 **`factualSearchForceMode`**、**`factualSearchForceFirstRound`**、**`maxReactIterationsForRequest`** 等字段（以现网 `dbg` 为准）。
- 流式 **`token`**：事实检索 **round 0** 若产生可见增量正文，可带 **`source: "search_agent"`**（`sse-contract.ts` 中 `ChatTokenPayload` 已扩展）；编排模式下的 `task_agent` / `route_agent` 与之并列，前端可**可选**弱样式区分。

**后续迭代方向**（文档层记录，非当前验收项）：

- 放宽或收紧 **`wantsGeneralFactualWebLookup`** 规则，平衡「更像常开搜索」与误触发、Serper 成本。
- 若产品坚持**物理双次 LLM**（独立 Search 子调用），可在本结构外挂一次「仅输出 `search` 的短 completion」，再进入主对话；成本与延迟需单独评估。

---

### 9.2 工具注册与调用

`ToolRegistry` 管理所有工具的定义和执行，工具以声明式 JSON Schema 描述，供 LLM 理解。

```typescript
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    }));
  }

  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map(async call => {
      const tool = this.tools.get(call.name);
      if (!tool) throw new Error(`Tool ${call.name} not found`);
      const output = await tool.execute(call.arguments);
      return { id: call.id, output };
    }));
  }
}
```

每个工具实现 `Tool` 接口，例如搜索工具：

```typescript
export class SearchTool implements Tool {
  name = 'search';
  description = '搜索实时信息（Serper）；类型与 PRD 2.6 对齐，按需传 type';
  parametersSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      type: {
        type: 'string',
        enum: [
          'organic',
          'news',
          'images',
          'videos',
          'places',
          'shopping',
          'scholar',
          'patents',
        ],
        default: 'organic',
        description: 'Serper 返回类型，与官方 API 一致',
      },
    },
    required: ['query'],
  };

  async execute(args: { query: string; type?: string }, ctx: ToolContext): Promise<string> {
    // SerperQuotaService：查/写 serper_usage，超软上限时抛业务错误或返回可解析 JSON 提示
    await serperQuota.assertUnderDailyLimit(ctx.userId);
    const results = await serperApi.search(args.query, args.type);
    await serperQuota.incrementOnSuccess(ctx.userId);
    return JSON.stringify(results);
  }
}
```

（`ToolContext`、`SerperQuotaService` 为命名示意：实现时由 `ChatService` 注入当前 `userId` 与配额服务。）

**`manage_workspace_files` 工具（PRD 2.5.4 对话管理文件）**

将工作空间操作暴露给 LLM，内部仅调用 `FileService` 与 D1，**校验 `user_id`**，避免模型直接伪造 HTTP。建议工具名：`manage_workspace_files`。

```typescript
export class WorkspaceFilesTool implements Tool {
  name = 'manage_workspace_files';
  description =
    '列出、删除、重命名工作空间文件，或更新语义类型/标签（如标记 important）。用于「删掉上次上传的简历」「把学习资料标成重要」等指令。';
  parametersSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'delete', 'rename', 'set_semantic_type', 'set_tags'],
      },
      file_id: { type: 'string', description: 'delete/rename/set_* 时必填' },
      new_name: { type: 'string' },
      semantic_type: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      folder_path: { type: 'string', description: 'list 时可选过滤前缀' },
      semantic_type_filter: { type: 'string', description: 'list 时按语义类型筛选' },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    return JSON.stringify(await fileService.handleToolAction(ctx.userId, args));
  }
}
```

实现要点：`list` 返回最近文件摘要（含 `id`、`original_name`、`semantic_type`、`folder_path`），便于模型解析「上次上传的简历」等指代；必要时可结合 `conversations` / 上传事件顺序。

---

### 9.3 规划与子代理（深度研究）

`PlannerService` 负责将复杂任务分解为子任务，并协调执行。当主 Agent 识别到用户需要“深度研究”时，会调用 `plan_research` 工具，该工具内部触发 `PlannerService`。

```typescript
export class PlannerService {
  async planAndExecute(goal: string): Promise<string> {
    // 1. 生成子任务列表
    const subTasks = await this.generateSubTasks(goal);
    const results = [];

    for (const task of subTasks) {
      // 2. 为每个子任务创建临时 Agent
      const subAgent = new SubAgent(this.llm, this.tools, this.memory);
      const result = await subAgent.execute(task);
      results.push(result);
    }

    // 3. 汇总生成最终报告
    return await this.summarize(goal, results);
  }

  private async generateSubTasks(goal: string): Promise<string[]> {
    const prompt = `请将以下研究目标分解为3-5个具体的子任务，每个子任务是一个独立的搜索或分析步骤，用列表形式输出：\n${goal}`;
    const response = await this.llm.chat([{ role: 'user', content: prompt }]);
    // 解析返回的子任务列表（简化实现）
    return response.content.split('\n').filter(l => l.trim().startsWith('-'));
  }

  private async summarize(goal: string, results: string[]): Promise<string> {
    const prompt = `基于以下研究结果，生成一份结构化的最终报告，包含主要观点、数据支持和结论：\n目标：${goal}\n子任务结果：\n${results.join('\n---\n')}`;
    const response = await this.llm.chat([{ role: 'user', content: prompt }]);
    return response.content;
  }
}
```

---

### 9.4 高级推理模式：TOT / GOT 实现

> **与 PRD 关系**：本节为增强能力，**不属于 PRD v1.1 必验收项**；上线建议默认关闭或通过配置仅在内部/实验用户开启，避免 token 与延迟超预期。

为了支持更复杂的思考链（如多路径探索、回溯），我们设计了独立的 TOT/GOT 模块，并封装为特殊工具，供主 Agent 调用。

#### 9.4.1 TOT（Tree of Thoughts）工具

`TotTool` 实现树状思考，允许模型生成多个思考分支，评估后选择最优路径：

```typescript
export class TotTool implements Tool {
  name = 'tree_of_thoughts';
  description = '使用树状思考模式解决复杂问题，会生成多个思考分支并选择最优路径';
  parametersSchema = {
    type: 'object',
    properties: {
      problem: { type: 'string', description: '需要解决的问题' },
      depth: { type: 'number', description: '思考深度（默认3）' },
      branchFactor: { type: 'number', description: '分支因子（默认3）' },
    },
    required: ['problem'],
  };

  async execute(args: { problem: string; depth?: number; branchFactor?: number }): Promise<string> {
    const depth = args.depth || 3;
    const branchFactor = args.branchFactor || 3;

    // 使用递归生成思考树
    const thoughts = await this.buildThoughtTree(args.problem, depth, branchFactor);
    // 评估每个叶子节点的结果
    const bestLeaf = await this.evaluateAndSelect(thoughts);
    // 返回最终答案
    return bestLeaf.solution;
  }

  private async buildThoughtTree(problem: string, depth: number, branchFactor: number): Promise<ThoughtNode> {
    // 实现树的构建逻辑：每层调用 LLM 生成多个思考方向，递归到指定深度
  }

  private async evaluateAndSelect(root: ThoughtNode): Promise<ThoughtNode> {
    // 使用 LLM 评估每个叶子节点的质量，选择最优路径
  }
}
```

#### 9.4.2 GOT（Graph of Thoughts）工具

`GotTool` 实现图状思考，支持节点之间相互引用和组合：

```typescript
export class GotTool implements Tool {
  name = 'graph_of_thoughts';
  description = '使用图状思考模式解决复杂问题，支持多思路组合和交叉验证';
  parametersSchema = {
    type: 'object',
    properties: {
      problem: { type: 'string', description: '需要解决的问题' },
      iterations: { type: 'number', description: '迭代次数（默认5）' },
    },
    required: ['problem'],
  };

  async execute(args: { problem: string; iterations?: number }): Promise<string> {
    const iterations = args.iterations || 5;
    // 实现图的生成与推理
    const graph = await this.buildThoughtGraph(args.problem);
    for (let i = 0; i < iterations; i++) {
      await this.refineGraph(graph);
    }
    return await this.extractSolution(graph);
  }
}
```

#### 9.4.3 与主 Agent 集成

将 TOT/GOT 作为普通工具注册到 `ToolRegistry`，LLM 在需要时自行决定调用。例如，用户问“如何解决某个复杂技术难题”，LLM 可能选择调用 `tree_of_thoughts` 进行深度推理。

```typescript
// 在 ToolRegistry 中注册
toolRegistry.register(new TotTool());
toolRegistry.register(new GotTool());
```

#### 9.4.4 性能与成本考虑

- 由于 TOT/GOT 会多次调用 LLM，可能显著增加 token 消耗和延迟。我们在工具内部设置 `maxDepth`、`maxBranches` 等限制，并在调用前通过系统提示告知 LLM 谨慎使用。
- 对于深度思考场景，可考虑使用更轻量的模型（如 Gemini Flash）生成中间步骤，最终由主模型汇总。

---

### 9.5 记忆与上下文管理

`MemoryService` 结合短期缓存和向量检索，为对话提供上下文：

```typescript
export class MemoryService {
  constructor(private vectorStore: VectorStore, private embedder: LLMProvider) {}

  async retrieve(query: string, userId: string, limit = 5): Promise<string[]> {
    const vector = await this.embedder.embed(query);
    const results = await this.vectorStore.search(vector, { user_id: userId }, limit);
    return results.map(r => r.payload.source);
  }

  async addToMemory(text: string, userId: string, type: 'conversation' | 'document', metadata?: any): Promise<void> {
    const vector = await this.embedder.embed(text);
    await this.vectorStore.upsert([{
      id: crypto.randomUUID(),
      vector,
      payload: { user_id: userId, type, source: text, timestamp: Date.now(), ...metadata },
    }]);
  }
}
```

短期记忆（当前会话）存储在 `ConversationService` 的数组中，随对话进行更新。每次对话开始时，会将最近 N 条消息（默认 10 轮）作为历史上下文传递给 LLM。

**与 PRD 2.7 对齐**：除 Qdrant 中的对话/文档片段外，**可结构化加载的长期数据**优先来自 D1：`users.preferences_json`（如回复风格）在渲染 system prompt 时注入；`tasks.detail_json` 承载子任务等结构化需求，由 `TaskTool` 与列表查询接口读写，避免仅靠向量检索不稳定召回。

---

### 9.6 意图识别与 Prompt 模板选择

在 `ChatService.handleMessage` 中，我们增加了意图识别步骤，用于选择更合适的系统提示词。

#### 9.6.1 意图分类器

意图分类器可以通过规则（关键词匹配）或轻量级 LLM 调用实现。为了简单，1.0 版本可采用规则，但为扩展性，我们设计了一个可插拔的 `IntentClassifier` 接口：

```typescript
export interface IntentClassifier {
  classify(userInput: string): Promise<string>;
}

export class RuleBasedIntentClassifier implements IntentClassifier {
  private patterns: Map<string, RegExp> = new Map([
    ['greeting', /^(你好|hi|hello|嘿)/i],
    ['task_operation', /(创建|添加|修改|删除|完成)任务/i],
    ['interview', /面试|模拟面试|岗位/i],
    ['research', /研究|深度研究|报告/i],
    ['file_upload', /上传|简历|文件/i],
    ['workspace_operation', /删除.*文件|重命名.*文件|标记.*重要|语义类型|工作空间/i],
    ['default', /.*/],
  ]);

  async classify(userInput: string): Promise<string> {
    for (const [intent, pattern] of this.patterns) {
      if (pattern.test(userInput)) return intent;
    }
    return 'default';
  }
}
```

未来可升级为基于 LLM 的分类器，返回更细粒度的意图。

#### 9.6.2 Prompt 模板选择

根据意图，从数据库中查询对应的 `prompt_template`。若无匹配，则使用 `default` 模板。

```typescript
async selectPrompt(intention: string): Promise<PromptTemplate> {
  const prompts = await this.db.select().from(promptTemplates)
    .where(eq(promptTemplates.scenario, intention));
  if (prompts.length) return prompts[0];
  // fallback to default
  const defaultPrompts = await this.db.select().from(promptTemplates)
    .where(eq(promptTemplates.scenario, 'default'));
  return defaultPrompts[0];
}
```

#### 9.6.3 模板渲染

将用户信息、工具定义等变量注入模板：

```typescript
render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}
```

---

### 9.7 对话记录持久化

每次用户消息和 AI 回复都会存入 `conversations` 表，包含意图、模板 ID、关键词和关联消息 ID。

```typescript
private async saveConversation(
  userId: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  meta: {
    intention: string;
    promptId: string;
    keywords: string[];
    conversationId?: string;
  }
): Promise<void> {
  const userMsgId = crypto.randomUUID();
  const assistantMsgId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // 保存用户消息
  await this.db.insert(conversations).values({
    id: userMsgId,
    userId,
    sessionId,
    role: 'user',
    content: userMessage,
    intention: meta.intention,
    keywords: JSON.stringify(meta.keywords),
    created_at: now,
  });

  // 保存 AI 回复
  await this.db.insert(conversations).values({
    id: assistantMsgId,
    userId,
    sessionId,
    role: 'assistant',
    content: assistantMessage,
    intention: meta.intention,
    promptId: meta.promptId,
    conversationId: userMsgId,
    created_at: now,
  });

  await this.db.update(chatSessions)
    .set({ updated_at: now })
    .where(eq(chatSessions.id, sessionId));
}
```

---

### 9.8 总结

本方案通过轻量自研实现了完整的 Agent 能力（**当前实现**以单管道 `ChatService` + ReAct 为主；**复合意图串行编排**见 **§9.9**）：

- **ReAct 循环**：支持多轮工具调用，由 LLM 自主决策。
- **工具注册与调用**：声明式工具定义，支持任意扩展。
- **规划与子代理**：深度研究等复杂任务可自动分解执行。
- **高级推理**：TOT/GOT 作为可选工具，处理复杂思考链。
- **记忆管理**：向量检索 + 短期缓存，提供长期上下文。
- **意图识别与 Prompt 模板**：根据场景动态调整系统提示，提升对话质量。
- **可观测性**：完整记录意图、模板、关键词，便于后续分析和优化。

所有代码在 Cloudflare Workers 边缘运行，保持低延迟和高性能，同时具备良好的可扩展性和维护性。

---

### 9.9 多 Agent 编排：Orchestrator 与专业 Agent（演进）

> **定位**：在保留现有 **单请求内 `ChatService` + ReAct** 的前提下，对「一句用户话隐含**多类能力**（如任务落库 + 路线规划）」引入 **显式编排层**，降低「一次暴露大量 tools、模型漏调 `add_task`」的不确定性。本节为**架构规划**，实现任务见 [`docs/tasks/tasks_backend_multi_agent_orchestration.md`](../tasks/tasks_backend_multi_agent_orchestration.md)。

#### 9.9.1 可行性结论（简要）

| 维度 | 评估 |
|------|------|
| **技术可行性** | 高。编排层仍是 **同进程、同一次 SSE 连接** 内的状态机 + 多段 LLM 调用，与当前 Workers 模型兼容；无需分布式消息队列即可落地 v1。 |
| **产品收益** | 用户可见「分步清单」；任务写库与路线解耦；**失败即止**避免幻觉链式扩散。 |
| **Token / 费用** | **当前阶段不作为优化目标**（不为此削减编排轮次或 GOT 深度）；后续若有成本约束再单列迭代。 |
| **墙钟延迟与体感** | 多轮 LLM 客观耗时可能上升；通过 **Orchestrator 统一持有 SSE 输出**、**阶段切换与子 Agent 进度及时下发**（事件与字段见 **§9.9.6.1**），让用户持续看到「正在分解 / 正在建任务 / 正在确认 / 正在规划路线」等反馈，**体感上保持连续交互**。 |
| **需注意的风险** | 见 **§9.9.7**；重试前 **`confirm_tool_creation`** 与 DB 对齐，避免重复插入。 |

#### 9.9.2 目标形态（示例句）

用户：「25号要去一趟苏州，和那边园林相关的师傅见个面。」

1. **Orchestrator（总 Agent）** 解析出 **子目标序列**（示例）：  
   - 子任务 1：**建立/更新日程类任务**（Task Agent）  
   - 子任务 2：**路线规划**（Route Plan Agent）— *当分解结果包含该步且子任务 1 **已成功**；**不要求用户再点确认**，由系统自动进入（体现「智能重试 / 自动衔接」）*。  
2. 向用户输出结构化说明，例如：  
   - 「您可能需要先做两件事：① 建立 … 的任务；② 再进行路线规划。我们按顺序来，先完成第 ① 步。」  
3. **串行执行**：子任务 1 **完全结束（成功或失败并告知用户）** 前，不启动子任务 2；**若 ① 失败，终止流水线**（不再进入路线阶段）。

#### 9.9.3 角色与职责

| 角色 | 职责 | 工具范围（示意） |
|------|------|------------------|
| **Orchestrator** | 意图分解、阶段切换、**统一向 SSE 写入阶段与进度文案**、失败止损、串联子 Agent | 可无工具或仅「元工具」（如 `handoff_to_agent`）；**禁止**代替子 Agent 直接写库 |
| **Task Agent** | 追问任务细节、`resolve_shanghai_calendar`、`add_task` / `update_task`、**写库后校验** | 任务域工具 + `confirm_tool_creation` |
| **Route Plan Agent** | 追问起终点、时间偏好、交通方式；调用高德系工具 | `amap_*`（与现 `route_query` 能力对齐） |
| **其他专业 Agent** | 与 **一种用户意图类别** 对齐（如 `research` → Research Agent），内部可独立演进 | 按场景注册 |

各 **专业 Agent 内部** 支持 **图结构推理（GOT）**：作为 **可选子引擎**（feature flag），简单场景仍可用线性 ReAct；复杂追问链再用 GOT 展开。

#### 9.9.4 任务创建闭环：`add_task` + `confirm_tool_creation`

- **`confirm_tool_creation`（新工具，须实现）**  
  - **输入**：`task_id`（来自 `add_task` 成功返回的 UUID）、可选 `title_hint` 用于二次校验。  
  - **行为**：在当前 `user_id` 下 **读 D1**（`TaskRepository.getById` 或等价），确认行存在且归属正确。  
  - **输出**：`{ ok: true, task: … }` 或 `{ ok: false, reason: … }`。  
- **与模型回复的关系**：仅当 `confirm_tool_creation.ok === true` 时，才允许向用户说「任务已创建」；否则输出「任务创建遇到问题，正在重试」并进入重试策略。  
- **`add_task` 重试（最多 3 次）与防重复创建**：**每次重试 `add_task` 之前**必须先根据当前已知 `task_id` 调用 **`confirm_tool_creation`**（或等价读库）：  
  - 若 **已存在** 有效任务行 → **视为已成功**，**不得**再次 `add_task`，直接结束 Task 阶段并进入后续（或向用户说明已存在）。  
  - 若 **确认无行** 或 `add_task` 从未成功返回 id → 才允许发起下一次 `add_task`。  
  - 这样体现「智能重试」：**用读库确认代替盲目重复插入**。  
- 可选扩展：**幂等键**（`client_correlation_id` 写入 `detail_json` 等）— 见实现任务文档。  
- **SSE**：在 `confirm` 成功或最终失败时，沿用/扩展 **`tool_result_meta`** / **`status` 或专用 orchestrator 事件**，驱动前端 **任务列表面板刷新**。

#### 9.9.5 Route Plan Agent（子任务 2）

- 在 **子任务 1 已成功**（含 `confirm_tool_creation` 通过）后 **自动启动**，**无需用户额外点击确认**。  
- 若分解结果中 **不包含** 路线类子步，则不进入本子 Agent。  
- 收集：**起点、终点、时间要求、交通方式** 等；调用 **`amap_geocode` / `amap_route_plan` / `amap_navigation_uri` / `amap_route_static_map`**（与现有高德工具一致）。  
- 输出须继续遵守「链接/图来自工具返回值」的纪律。

#### 9.9.6 SSE、体感延迟与 Orchestrator 对流式的控制

- **单一流式连接**：对用户仍是一条 **`POST /api/chat/stream` 响应**；**Orchestrator 作为唯一「对外发言人」**（或统一 `send()` 入口），子 Agent 不各自开 SSE。  
- **高频同步**：在分解完成、进入 Task Agent、每次工具前后、`confirm` 重试、转入 Route Agent、高德工具执行等节点，**及时**向下游发送下列事件（见下表）。  
- **目标**：即使用户等待多轮 LLM，界面仍持续有更新，**降低「卡住」感**；与「当前阶段不优化 token 成本」不矛盾。  
- **兼容**：未识别 `orchestrator_*` 的旧前端应 **忽略未知 `event` 名**（SSE 标准行为），仍可消费 `token` / `done` / `tool_result_meta`。

##### 9.9.6.1 Orchestrator 模式下的 SSE 最小集合（字段级契约）

以下约定 **一次用户发送消息、进入多 Agent 编排**时的 **下限**（实现可多发，不得少发「必选」行）。帧格式与现网一致：`event: <名称>` + `data: <JSON>` + 空行（见 §5.1）。

**贯穿字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `correlation_id` | `string`（UUID） | **本条用户消息**在本次 `POST /api/chat/stream` 内唯一；所有 `orchestrator_*` 及本条末尾可选的 `done.orchestrator` 须一致，便于前端与日志对齐。 |
| `schema_version` | `number` | 编排 payload 版本；当前为 **`1`**，后续仅增量扩字段、不改语义。 |

---

**事件：`orchestrator_plan`**（必选，至少 **1** 次）

| 时机 | 分解完成并得到有序子步后立刻发送；任一步的 `status` 变化时 **应再次发送** 全量或增量（实现二选一：全量快照最简单）。 |
|------|------------------------------------------------------------------|

`data` JSON：

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `correlation_id` | `string` | 是 | 见上 |
| `schema_version` | `number` | 是 | `1` |
| `steps` | `array` | 是 | 有序子任务列表，供 UI 步骤条使用 |
| `steps[].id` | `string` | 是 | 稳定 id，如 `s1`、`s2` |
| `steps[].type` | `string` | 是 | 枚举：`task` \| `route` \| `research` \| …（未知类型前端可降级为纯文案） |
| `steps[].title` | `string` | 是 | 短标题，如「建立日程任务」「路线规划」 |
| `steps[].status` | `string` | 是 | `pending` \| `running` \| `done` \| `skipped` \| `failed` |

示例：

```json
{
  "correlation_id": "7c9e2b1a-…",
  "schema_version": 1,
  "steps": [
    { "id": "s1", "type": "task", "title": "建立日程任务", "status": "running" },
    { "id": "s2", "type": "route", "title": "路线规划", "status": "pending" }
  ]
}
```

---

**事件：`orchestrator_progress`**（必选，**多次**）

| 时机（至少覆盖） | 收到用户消息后、`orchestrator_plan` 前（可选）；`orchestrator_plan` 后；进入 Task / Route 子 Agent 前后；**每次** `confirm_tool_creation` 与 **每次** `add_task` 重试前后；子 Agent 内每次批量工具执行前后（可选，建议发）；流水线结束或放弃前。 |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

`data` JSON：

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `correlation_id` | `string` | 是 | 见上 |
| `schema_version` | `number` | 是 | `1` |
| `phase` | `string` | 是 | 机器可读阶段，建议枚举：`decompose` \| `task_agent` \| `task_tool` \| `task_confirm` \| `task_retry` \| `route_agent` \| `route_tool` \| `finalize` \| `fallback_single_chat` |
| `step_id` | `string` \| `null` | 否 | 关联 `orchestrator_plan.steps[].id`；无对应步时 `null` |
| `attempt` | `number` | 否 | 当前子步内重试序号，从 **1** 起；无重试可省略 |
| `message` | `string` | 是 | **给用户看的**一行说明（中文即可），如「正在确认任务是否已写入数据库…」 |
| `level` | `string` | 否 | `info`（默认）\| `warn` \| `error` |

---

**事件：`status`（必选，与现网兼容）**

| 时机 | 连接建立、拉 RAG、模型生成、工具执行等 **现有**节点仍发送；进入编排时建议额外发送 `phase` 为下列之一，便于只订阅 `status` 的轻量客户端感知： |
|------|------------------------------------------------------------------|

`data` JSON（在现有字段基础上 **可选扩展**）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `phase` | `string` | 保留现有：`connected`、`memory_retrieving`、`model_generating`、`tools_running` 等；**新增**可选：`orchestrating`（表示处于多 Agent 编排中，详情见 `orchestrator_progress`） |
| `reason` | `string` | 与现有一致，可选 |
| `correlation_id` | `string` | 可选；**建议**在 `phase === 'orchestrating'` 时带上，与编排事件对齐 |

---

**事件：`token`**（条件必选）

| 时机 | 子 Agent 流式输出 **用户可见正文**时，与现 `ChatService` 一致，**增量**发送。 |
|------|------------------------------------------------------------------|

`data` JSON：

| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `content` | `string` | 是 | 正文增量 |
| `source` | `string` | 否 | 建议编排模式下填写：`orchestrator` \| `task_agent` \| `route_agent`；**非编排**事实检索首轮（§9.1.1）可填 **`search_agent`**。供前端区分字体/缩进；省略则视为与历史行为兼容的「主助手」流 |

---

**事件：`tool_call` / `tool_result_meta`**（条件必选）

| 时机 | 与现网一致：发起工具调用与需要刷新侧栏等元信息时 **必须**发送，字段形状不变。 |
|------|------------------------------------------------------------------|

---

**事件：`intention`**（推荐）

| 时机 | Orchestrator 若仍做顶层意图分类，可发送；**无则**可省略（由 `orchestrator_plan` 承担语义）。 |
|------|------------------------------------------------------------------|

---

**事件：`done`**（必选）

| 时机 | 本条流正常结束；**必须**发送（与现网一致）。 |
|------|------------------------------------------------------------------|

`data` JSON **可选扩展**（编排模式推荐带上，便于前端收尾）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `orchestrator` | `object` | 仅编排路径 |
| `orchestrator.correlation_id` | `string` | 与本轮一致 |
| `orchestrator.outcome` | `string` | `success` \| `partial`（如任务成、路线跳过）\| `failed` |

---

**前端消费建议（最小实现）**

1. 用 **`orchestrator_plan`** 渲染步骤条；用 **`orchestrator_progress.message`** 渲染进度/日志行。  
2. **`token`** 拼接主对话气泡；若带 `source`，可对 `task_agent` / `route_agent` /（普通对话路径下的）`search_agent`（§9.1.1）做弱样式区分。  
3. **`tool_result_meta`** 继续驱动任务列表等；**`done.orchestrator.outcome`** 做结束态图标或 toast。  
4. 忽略未知 `event` 名与未知 `phase` / `steps[].type`。

##### 9.9.6.2 TypeScript 形状（便于前后端共用的单文件类型）

```typescript
/** 编排 SSE：schema_version === 1 */
export type OrchestratorStepType = 'task' | 'route' | 'research' | string;
export type OrchestratorStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface OrchestratorPlanPayload {
  correlation_id: string;
  schema_version: 1;
  steps: Array<{
    id: string;
    type: OrchestratorStepType;
    title: string;
    status: OrchestratorStepStatus;
  }>;
}

export type OrchestratorProgressPhase =
  | 'decompose'
  | 'task_agent'
  | 'task_tool'
  | 'task_confirm'
  | 'task_retry'
  | 'route_agent'
  | 'route_tool'
  | 'finalize'
  | 'fallback_single_chat';

export interface OrchestratorProgressPayload {
  correlation_id: string;
  schema_version: 1;
  phase: OrchestratorProgressPhase | string;
  step_id?: string | null;
  attempt?: number;
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export interface ChatStreamDoneOrchestrator {
  correlation_id: string;
  outcome: 'success' | 'partial' | 'failed';
}
```

#### 9.9.7 风险与迭代策略

1. **分解过判 / 漏判**：**第一版按既定 Orchestrator 规则实现即可**；上线后根据真实对话与埋点迭代分解 Prompt 或规则，**不阻塞首发**。  
2. **单连接内多阶段 UX**：须区分 **Orchestrator 阶段说明** 与子 Agent **流式正文**；建议专用事件或 `status.phase` 字段，避免前端混排。  
3. **`tool_choice: required` 的历史漏洞**（只调 `list_tasks`）：编排下 **Task Agent** 工具集与策略层收紧，要求新建路径必须命中 **`add_task`**（或显式 `update_task`），见任务列表。  
4. **重试与重复任务**：以 **§9.9.4** 的「重试前先 `confirm`」为硬性约定。  
5. **GOT**：默认关闭或仅复杂场景开启；可观测性上继续记录 `llm_chat_stream` 轮次与耗时。

#### 9.9.8 Agent 间通信（进程内，预留）

- **范围**：同一 Worker 进程内，**不考虑**跨机分布式 Agent。  
- **预留接口（示意）**：`AgentBus` / `AgentContext`  
  - `publish(topic, envelope)` / `subscribe` 或 **显式 `handoff({ from, to, intent, payload })`**。  
  - `envelope` 含：`correlation_id`、`session_id`、`user_id`、**只读快照**（如已创建 `task_id`、已解析的日历结果），避免子 Agent 互相直接改共享可变状态。  
- **当前阶段**：可无跨 Agent 消息（Orchestrator 直接函数调用子 Runner）；接口先 **定义 TypeScript 类型 + 空实现或日志桩**，便于后续「子 Agent 回调 Orchestrator」「并行分支合并」等扩展。

#### 9.9.9 与现有代码关系

- **现状**：`ChatService` 单管道 ReAct；`PlannerService` 仅服务于 **`plan_research`**。  
- **演进**：引入 **`OrchestrationService`（命名可调整）** 于 `POST /api/chat/stream` 内 **在用户消息进入原 `ChatService` 之前或替代其最外层**，按「是否多子目标」分支：  
  - 简单句 → 保持现有路径（降低回归面）；  
  - 复合句 → 走 Orchestrator 流水线。  
- 具体文件布局与迁移步骤以任务列表文档为准。

#### 9.9.10 主 Agent「识别不出意图」与零子步时的处理

**会不会出现「完全没有意图」？** 分两层：

1. **现网（规则意图分类器 `RuleBasedIntentClassifier`）**  
   - 没有任何规则命中时，**不会**返回空值，而是回退为 **`default`**（见 §9.6）。  
   - 即：始终有一个字符串意图；**`default` 表示「未落入已知业务类」**，仍走 **`default` 场景模板 + 全量工具** 的 `ChatService` ReAct，由模型在对话中理解用户。  
   - 因此**不存在**「后端无处可走、直接 4xx」的意图真空；最差情况是 **泛化对话**，工具由模型按需选用。

2. **演进中的 Orchestrator（LLM 分解子步）**  
   - 可能出现：**解析失败**、**JSON 不合规**、**steps 为空**、或模型明确表示无法分解。  
   - **处理策略（推荐写死）**：**不启动**任何专业子 Agent，进入 **`fallback_single_chat`**（与 `orchestrator_progress.phase` 枚举一致）：  
     - **委托现有 `ChatService` 单管道**（与今日行为一致）：同一条 SSE，照常 `token` / `tool_call` / `done`。  
   - **SSE**：至少一条 `orchestrator_progress`，`phase: "fallback_single_chat"`，`message` 向用户简短说明「按常规对话处理」；**可不发送** `orchestrator_plan`，或发送 `steps: []` 且 `done.orchestrator.outcome` 为 `partial`/`success`（与产品约定二选一，实现保持前后端一致即可）。  
   - **与「识别不出」的语义对齐**：Orchestrator 的「识别不出」= **无法得到可执行子步列表** → **降级为单 Agent**，而不是报错中断（除非 LLM/网络整体失败，走现有流式错误分支）。

**小结**：规则层没有「无意图」只有 **`default`**；编排层「分解失败」则 **`fallback_single_chat`** 回退到现有对话管线，保证用户始终收到流式回复（在依赖服务正常的前提下）。

```mermaid
flowchart TD
  U[用户消息] --> O[Orchestrator]
  O -->|分解失败或 steps 为空| FSC[fallback_single_chat 等同现网 ChatService]
  O -->|SSE 阶段说明| UX[用户可见进度]
  O --> T[Task Agent]
  T --> AT[add_task]
  AT --> CF[confirm_tool_creation]
  CF -->|ok 且分解含路线| P[Route Plan Agent 自动启动]
  CF -->|ok 且无路线步| E[结束本请求]
  CF -->|不 ok 先查库| Q{confirm 显示已存在?}
  Q -->|是| E
  Q -->|否 重试≤3| AT
  CF -->|最终失败| F[终止并提示]
  P --> AM[amap_*]
```

---

## 10. 类图（Mermaid）

以下是核心类及接口的完整 UML 类图，展示了模块之间的依赖关系。

```mermaid
classDiagram
    class LLMProvider {
        <<interface>>
        +chat(messages, tools) Promise~LLMResponse~
        +streamChat(messages, tools) ReadableStream
        +embed(text) Promise~number[]~
    }
    class GeminiProvider {
        -apiKey: string
        -model: string
        +chat(messages, tools) Promise~LLMResponse~
        +streamChat(messages, tools) ReadableStream
        +embed(text) Promise~number[]~
    }
    class OpenAiProvider {
        -apiKey: string
        -model: string
        +chat(messages, tools) Promise~LLMResponse~
        +streamChat(messages, tools) ReadableStream
        +embed(text) Promise~number[]~
    }
    LLMProvider <|.. GeminiProvider
    LLMProvider <|.. OpenAiProvider

    class VectorStore {
        <<interface>>
        +upsert(points) Promise~void~
        +search(vector, filter, limit) Promise~VectorPoint[]~
        +delete(ids) Promise~void~
    }
    class QdrantStore {
        -client: QdrantClient
        +upsert(points) Promise~void~
        +search(vector, filter, limit) Promise~VectorPoint[]~
        +delete(ids) Promise~void~
    }
    VectorStore <|.. QdrantStore

    class FileStorage {
        <<interface>>
        +upload(key, data) Promise~{etag}~
        +download(key) Promise~ArrayBuffer~
        +delete(key) Promise~void~
        +getSignedUrl(key, expiresIn) Promise~string~
        +initiateMultipartUpload(key) Promise~{uploadId}~
        +uploadPart(key, uploadId, partNumber, data) Promise~{etag}~
        +completeMultipartUpload(key, uploadId, parts) Promise~void~
    }
    class R2Storage {
        -bucket: R2Bucket
        +upload(key, data) Promise~{etag}~
        +...
    }
    FileStorage <|.. R2Storage

    class ToolRegistry {
        -tools: Map~string, Tool~
        +register(tool) void
        +execute(name, args) Promise~any~
        +executeAll(toolCalls) Promise~ToolResult[]~
        +getDefinitions() ToolDefinition[]
    }
    class SearchTool {
        +execute(args) Promise~string~
    }
    class TaskTool {
        +execute(args) Promise~string~
    }
    class WorkspaceFilesTool {
        +execute(args) Promise~string~
    }
    class TotTool {
        +execute(args) Promise~string~
    }
    class GotTool {
        +execute(args) Promise~string~
    }
    ToolRegistry o-- SearchTool
    ToolRegistry o-- TaskTool
    ToolRegistry o-- WorkspaceFilesTool
    ToolRegistry o-- TotTool
    ToolRegistry o-- GotTool

    class IntentClassifier {
        <<interface>>
        +classify(userInput) Promise~string~
    }
    class RuleBasedIntentClassifier {
        -patterns: Map~string, RegExp~
        +classify(userInput) Promise~string~
    }
    IntentClassifier <|.. RuleBasedIntentClassifier

    class PromptService {
        -db: DrizzleDB
        +selectTemplate(intention) Promise~PromptTemplate~
        +render(template, vars) string
    }

    class ChatService {
        -llm: LLMProvider
        -tools: ToolRegistry
        -memory: MemoryService
        -db: DrizzleDB
        -intentClassifier: IntentClassifier
        -promptService: PromptService
        +handleMessage(userId, message) Promise~LLMResponse~
        -buildMessages(userId, userInput, systemPrompt) Promise~LLMMessage[]~
        -saveConversation(userId, userMsg, assistantMsg, meta) Promise~void~
        -extractKeywords(text) string[]
    }
    class MemoryService {
        -vectorStore: VectorStore
        -embedder: LLMProvider
        +retrieve(query, userId, limit) Promise~string[]~
        +addToMemory(text, userId, type, metadata) Promise~void~
    }
    class PlannerService {
        -llm: LLMProvider
        -tools: ToolRegistry
        +planAndExecute(goal) Promise~string~
        -generateSubTasks(goal) Promise~string[]~
        -summarize(goal, results) Promise~string~
    }
    class FileService {
        -storage: FileStorage
        -db: DrizzleDB
        -memoryService: MemoryService
        +listFiles(userId, filter) Promise~FileInfo[]~
        +uploadFile(userId, file, semanticType) Promise~FileInfo~
        +deleteFile(userId, fileId) Promise~void~
        +renameFile(userId, fileId, newName) Promise~FileInfo~
        +updateSemanticType(userId, fileId, type) Promise~void~
        +updateTags(userId, fileId, tags) Promise~void~
        +getDownloadUrl(userId, fileId) Promise~string~
        +processFile(fileId, content) Promise~void~
        +handleToolAction(userId, args) Promise~unknown~
    }
    ChatService --> LLMProvider
    ChatService --> ToolRegistry
    ChatService --> MemoryService
    ChatService --> IntentClassifier
    ChatService --> PromptService
    MemoryService --> VectorStore
    MemoryService --> LLMProvider
    PlannerService --> LLMProvider
    PlannerService --> ToolRegistry
    FileService --> FileStorage
    FileService --> MemoryService
```

---

## 11. 主要交互流程（Mermaid）

以下流程图详细描述了核心功能的交互过程。

### 11.1 完整对话流程（含意图识别与模板选择）

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Worker as Cloudflare Worker
    participant IntentClassifier
    participant PromptService
    participant D1
    participant Qdrant
    participant LLM as Gemini API
    participant ToolRegistry
    participant Serper as Serper API

    User->>Frontend: 输入消息（已选 session_id）
    Frontend->>Worker: POST /api/chat/stream（body 含 session_id）
    Worker->>D1: 校验 session 归属 + 加载该会话历史消息
    D1-->>Worker: 用户信息、会话内历史
    Worker->>IntentClassifier: classify(userInput)
    IntentClassifier-->>Worker: intention (e.g., "research")
    Worker->>PromptService: selectTemplate(intention)
    PromptService->>D1: 查询 prompt_templates
    D1-->>PromptService: 模板内容
    PromptService-->>Worker: 渲染后的 system prompt
    Worker->>Qdrant: 检索相关记忆（RAG）
    Qdrant-->>Worker: 相似片段
    Worker->>LLM: 调用聊天接口（系统提示 + 历史 + RAG + 工具定义）
    LLM-->>Worker: 返回 function_call (如 search) 或直接回复
    alt 有工具调用
        Worker->>ToolRegistry: executeAll(toolCalls)
        ToolRegistry->>Serper: 调用搜索API
        Serper-->>ToolRegistry: 搜索结果
        ToolRegistry-->>Worker: 工具结果
        Worker->>LLM: 第二次调用（注入工具结果）
        LLM-->>Worker: 流式返回最终答案
    else 无工具调用
        LLM-->>Worker: 流式返回答案
    end
    Worker->>D1: 保存用户消息和AI回复（含 session_id、intention、prompt_id、keywords）
    opt 首轮成对消息完成且标题为自动
        Worker->>LLM: 生成会话标题（轻量调用）
        Worker->>D1: UPDATE chat_sessions.title
    end
    Worker-->>Frontend: SSE 流式输出（token、tool_call 等事件）
    Frontend-->>User: 渲染回复
```

### 11.2 深度研究流程（子代理规划）

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Worker
    participant LLM
    participant PlannerService
    participant Serper

    User->>Frontend: 要求深度研究
    Frontend->>Worker: 发起对话（意图 research）
    Worker->>LLM: 调用规划提示（生成子任务列表）
    LLM-->>Worker: 返回子任务1、2、3
    Worker->>PlannerService: planAndExecute(goal)
    loop 每个子任务
        PlannerService->>LLM: 执行子任务（调用 search）
        LLM-->>PlannerService: 返回 function_call
        PlannerService->>Serper: 执行搜索
        Serper-->>PlannerService: 结果
        PlannerService->>LLM: 请求总结子任务
        LLM-->>PlannerService: 子任务摘要
    end
    PlannerService->>LLM: 汇总所有子任务结果
    LLM-->>PlannerService: 生成最终报告
    PlannerService-->>Worker: 返回报告
    Worker-->>Frontend: SSE 流式输出报告
```

### 11.3 文件上传与 RAG 处理流程（含进度反馈）

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Worker
    participant R2
    participant D1
    participant Qdrant
    participant LLM

    User->>Frontend: 拖拽文件到工作空间
    Frontend->>Frontend: 显示虚线占位节点
    User->>Frontend: 填写语义类型弹窗
    Frontend->>Worker: POST /api/files/initiate-multipart
    Worker->>R2: 初始化分片上传
    R2-->>Worker: uploadId, 分片URLs
    Worker-->>Frontend: 返回 uploadId 和分片URLs
    loop 每个分片
        Frontend->>R2: 上传分片（直接到预签名URL）
        Frontend->>Frontend: 更新进度条（基于已上传字节）
    end
    Frontend->>Worker: POST /api/files/complete-multipart
    Worker->>R2: 完成上传
    Worker->>D1: 插入 file_uploads 记录
    D1-->>Worker: fileId
    Worker-->>Frontend: 返回成功
    Frontend->>Frontend: 节点变为实线，移除进度条
    Frontend->>User: 显示通知“上传成功”

    Note over Worker: 异步处理
    Worker->>Worker: 提取文本内容（PDF、Word等）
    Worker->>LLM: 为文本分块生成向量
    LLM-->>Worker: 向量列表
    Worker->>Qdrant: 存储向量及元数据（fileId, semantic_type）
    Worker->>D1: 更新 processed = 1
```

### 11.4 TOT 高级推理流程

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Worker
    participant LLM as Gemini API
    participant TotTool as TOT Tool

    User->>Frontend: 提出复杂问题
    Frontend->>Worker: POST /api/chat/stream
    Worker->>LLM: 调用主 Agent（含工具定义）
    LLM-->>Worker: 返回 tool_call (tree_of_thoughts)
    Worker->>TotTool: 执行 TOT 工具
    loop 构建思考树
        TotTool->>LLM: 生成多个分支思考
        LLM-->>TotTool: 返回分支内容
        TotTool->>LLM: 评估分支质量
        LLM-->>TotTool: 评分
    end
    TotTool-->>Worker: 返回最优解
    Worker->>LLM: 将结果注入继续对话
    LLM-->>Worker: 最终答案
    Worker-->>Frontend: SSE 流式输出
```

### 11.5 用户首次访问与信息收集流程

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Worker
    participant D1
    participant LLM

    User->>Frontend: 打开登录／落地页（名称必填、邮箱选填）
    User->>Frontend: 点击「开始吧」或「欢迎回来」
    Frontend->>Worker: POST /api/auth/login { name, email? }
    Worker->>D1: 按 name 查重；创建或读取用户
    D1-->>Worker: user 行
    Worker-->>Frontend: JWT + user + is_new_user
    Frontend->>Worker: GET /api/sessions（或 POST 创建首个会话）
    Worker-->>Frontend: 会话列表含 session_id
    User->>Frontend: 在会话中发送首条消息
    Frontend->>Worker: POST /api/chat/stream（session_id）
    Worker->>D1: 读取用户资料；若 email 等缺失则注入 PROFILE_GAPS
    Worker->>LLM: 生成回复（须同时询问缺失资料）
    LLM-->>Worker: 流式正文
    Worker->>D1: 持久化消息行（session_id）
    User->>Frontend: 在对话或设置中补充邮箱／称呼
    Frontend->>Worker: PUT /api/user
    Worker->>D1: 更新 users
```

**再登录**：同一 `name` 调用 `POST /api/auth/login` 返回 `is_new_user: false`，前端 `GET /api/sessions` + `GET /api/sessions/:id/messages` 恢复列表与历史，避免「历史空白」。

---

以上流程图完整覆盖了对话管理、工具调用、深度研究、文件上传、意图识别等核心交互，并与类图中的模块对应，便于开发人员理解整体流程。

---

## 12. 文件上传进度反馈详细设计

### 12.1 前端实现

对于小文件（≤5MB）：
- 使用 `XMLHttpRequest` 的 `upload.onprogress` 事件获取上传进度，更新进度条。

对于大文件（>5MB）：
- 前端先调用 `initiate-multipart` 获取 uploadId 和分片 URL。
- 对每个分片，使用 `XMLHttpRequest` 上传到预签名 URL，监听每个分片的进度。
- 累积已上传字节数，计算总体进度。
- 所有分片完成后，调用 `complete-multipart`。

### 12.2 后端支持

后端在 `initiate-multipart` 时返回分片 URL 列表，前端可直接上传到 R2，后端无需参与数据传输。因此，后端无需额外推送进度，前端自行计算即可。

### 12.3 失败处理

如果某个分片上传失败，前端应允许用户重试该分片。后端接口支持断点续传（即已经上传的分片保留，未上传的重新上传）。在 `complete-multipart` 时，后端会验证所有分片是否存在。

### 12.4 UI 表现

- 上传开始时，显示虚线边框文件节点。
- 上传过程中，节点上显示进度条（或圆形进度）。
- 上传成功后，节点变为实线，刷新文件信息。
- 上传失败时，节点变红，显示错误信息，并显示重试按钮。

---

## 13. 文件目录组织结构

```
backend/
├── .wrangler/                         # Cloudflare 本地配置
├── src/
│   ├── index.ts                       # Worker 入口，注册路由
│   ├── core/                          # 核心业务逻辑
│   │   ├── ChatService.ts             # 对话管理（含 ReAct 循环、意图识别、模板选择）
│   │   ├── ToolRegistry.ts            # 工具注册与执行
│   │   ├── MemoryService.ts           # 记忆召回（向量检索）
│   │   ├── PlannerService.ts          # 子代理规划（深度研究）
│   │   ├── TotService.ts              # TOT 树状思考实现
│   │   └── GotService.ts              # GOT 图状思考实现
│   ├── llm/                           # LLM 抽象层
│   │   ├── LLMProvider.ts             # 抽象接口
│   │   ├── GeminiProvider.ts          # Gemini 实现
│   │   ├── pricing.ts                 # 成本计算模型
│   │   └── (future: OpenAiProvider.ts)
│   ├── vector/                        # 向量数据库抽象层
│   │   ├── VectorStore.ts             # 抽象接口
│   │   └── QdrantStore.ts             # Qdrant 实现
│   ├── db/                            # 关系数据库
│   │   ├── schema.ts                  # Drizzle 表定义
│   │   ├── migrations/                # D1 迁移文件（按顺序执行）
│   │   │   ├── 0001_create_users.sql
│   │   │   ├── 0002_create_projects.sql
│   │   │   ├── 0003_create_tasks.sql
│   │   │   ├── 0004_create_prompt_templates.sql
│   │   │   ├── 0005_create_conversations.sql
│   │   │   ├── 0006_create_file_uploads.sql
│   │   │   ├── 0007_prd_alignment.sql
│   │   │   └── 0008_chat_sessions_and_messages.sql
│   │   └── repositories/              # 数据访问层
│   │       ├── UserRepository.ts
│   │       ├── SessionRepository.ts
│   │       ├── TaskRepository.ts
│   │       ├── ProjectRepository.ts
│   │       ├── FileRepository.ts
│   │       └── PromptRepository.ts
│   ├── storage/                       # 文件存储抽象层
│   │   ├── FileStorage.ts             # 抽象接口
│   │   └── R2Storage.ts               # Cloudflare R2 实现
│   ├── tools/                         # 具体工具实现
│   │   ├── index.ts                   # 统一导出
│   │   ├── SearchTool.ts              # 搜索工具（调用 Serper，含用量计数）
│   │   ├── WorkspaceFilesTool.ts      # 工作空间文件（对话侧，PRD 2.5.4）
│   │   ├── TaskTool.ts                # 任务管理工具
│   │   ├── UserTool.ts                # 用户信息工具
│   │   ├── ExportTool.ts              # 报告导出工具
│   │   ├── TotTool.ts                 # TOT 工具封装
│   │   └── GotTool.ts                 # GOT 工具封装
│   ├── api/                           # 路由处理（Hono）
│   │   ├── auth.ts                    # POST /api/auth/login 等
│   │   ├── chat.ts                    # 对话接口（SSE）
│   │   ├── sessions.ts                # 会话列表、历史消息、重命名
│   │   ├── user.ts                    # 用户信息接口
│   │   ├── tasks.ts                   # 任务管理接口
│   │   ├── files.ts                   # 文件管理接口
│   │   └── prompts.ts                 # Prompt 模板管理接口
│   ├── services/                      # 服务层
│   │   └── FileService.ts             # 文件业务逻辑（含异步处理）
│   ├── utils/                         # 通用工具
│   │   ├── logger.ts                  # 日志
│   │   ├── embeddings.ts              # 向量化辅助
│   │   ├── sse.ts                     # SSE 流式辅助
│   │   ├── errors.ts                  # 自定义错误类
│   │   ├── prompt.ts                  # 提示词渲染
│   │   └── file-parser.ts             # PDF/Word 等文本提取
│   └── types/                         # 全局类型定义
│       ├── index.ts
│       └── tool.ts
├── tests/                             # 单元测试与集成测试
│   ├── core/
│   ├── llm/
│   ├── tools/
│   └── e2e/
├── wrangler.toml                      # Cloudflare 配置
├── package.json
├── tsconfig.json
└── drizzle.config.ts                  # Drizzle 配置
```

---

## 14. 异常处理策略

| 异常类型 | 处理方式 |
|----------|----------|
| **Gemini API 限流/超时** | 重试最多 2 次，若仍失败，返回友好提示：“AI 服务繁忙，请稍后再试。” |
| **Serper API 异常** | 捕获错误，告知用户“搜索服务暂时不可用”，降级为纯 AI 回答（基于知识库）。 |
| **Serper 日配额/频率软上限** | 读取 `serper_usage`：未超限时正常调用；接近或超过配置阈值时返回结构化提示（可含「是否继续研究」），与 PRD 2.6.2-6 一致；**不泄露**其他用户数据。 |
| **Qdrant 连接失败** | 记录错误，跳过 RAG 检索，仅使用短期记忆。 |
| **D1 数据库错误** | 返回 500，记录日志，提示用户刷新重试。 |
| **用户输入过长** | 返回提示“消息过长，请精简后重试”。 |
| **未授权访问** | 返回 401，提示登录。 |
| **session 不属于当前用户** | 返回 403 或 404，前端清空非法 `sessionId` 并回退会话列表。 |
| **非法认证参数** | 返回 **400**（如空名称）；名称过长等校验失败同理。 |
| **文件大小超限** | 返回 413，提示“文件不能超过 64 MB”。 |
| **R2 上传失败** | 返回 500，前端展示重试按钮；记录错误日志。 |
| **文本提取失败** | 标记文件 processed = -1，但文件本身仍可下载；用户可手动触发重试。 |
| **Qdrant 存储失败** | 同上，异步重试机制。 |

**统一错误处理中间件**（Hono）：
```typescript
app.onError((err, c) => {
  console.error(err);
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof DatabaseError) return c.json({ error: '数据库错误，请稍后重试' }, 500);
  if (err instanceof LLMError) return c.json({ error: 'AI 服务繁忙，请稍后再试' }, 503);
  if (err instanceof FileSizeError) return c.json({ error: err.message }, 413);
  return c.json({ error: '内部服务器错误' }, 500);
});
```

---

## 15. 数据埋点设计

埋点用于追踪功能使用情况和性能，采用异步 HTTP 请求上报到第三方分析服务。

**关键事件**：
| 事件名 | 触发时机 | 附加字段 |
|--------|----------|----------|
| `user_register` | 首次收集姓名/邮箱 | user_id, name |
| `task_created` | 创建任务 | user_id, task_id |
| `task_updated` | 更新任务 | user_id, task_id, new_status |
| `search_executed` | 调用 Serper API | user_id, query, result_count |
| `rag_retrieved` | 从 Qdrant 检索成功 | user_id, query, top_score |
| `tool_call` | 任意工具调用 | user_id, tool_name, success |
| `chat_response_time` | AI 响应完成 | user_id, duration_ms, tool_calls_count |
| `export_generated` | 导出报告 | user_id, export_type, file_size |
| `tot_invoked` | TOT 工具被调用 | user_id, depth, branch_factor, duration_ms |
| `llm_usage` | LLM 调用后 | user_id, model, promptTokens, completionTokens, estimatedCost |
| `file_upload_start` | 用户开始上传文件 | user_id, file_size, mime_type |
| `file_upload_success` | 上传成功 | user_id, file_id, duration_ms |
| `file_upload_failed` | 上传失败 | user_id, error_code, error_msg |
| `file_deleted` | 删除文件 | user_id, file_id |
| `file_renamed` | 重命名文件 | user_id, file_id |
| `rag_file_retrieved` | 对话中检索到文件片段 | user_id, file_id, similarity_score |
| `prompt_selected` | 选择 Prompt 模板 | user_id, prompt_id, intention |

**实现**：
```typescript
// 在核心服务中调用
this.trackEvent('chat_response', { userId, duration, toolCalls: result.tool_calls?.length });
```

---

## 16. 性能描述与优化

- **冷启动**：Cloudflare Workers 冷启动时间 < 50ms，可忽略。
- **响应时间**：
  - 简单对话（无工具）：Gemini 平均 2-3 秒，SSE 流式逐步返回。
  - 搜索工具调用：Serper API 1-2 秒 + Gemini 再处理 2-3 秒，总计约 5 秒。
  - 深度研究（多步）：用户可见进度提示，每步交互时间累加。
  - TOT/GOT 推理：取决于分支数和深度，可能增加 5-10 秒，需向用户显示“正在深度思考”。
- **并发**：Workers 自动扩展，免费计划每日 10 万请求，足够原型使用。
- **数据库优化**：D1 使用索引（user_id），Qdrant 使用 `user_id` 过滤检索，确保查询效率。
- **Token 优化**：通过摘要压缩历史、截断 RAG 片段，控制输入 tokens 数量，降低成本和延迟。
- **文件上传**：分片上传减少单点失败影响，前端进度条基于 XMLHttpRequest 实现，无需后端推送。

---

## 17. 安全与隐私

- **API 密钥**：存储在 `wrangler.toml` 的 `vars` 或 `secrets` 中，不暴露给客户端。
- **CORS**：Hono 启用 `cors` 中间件，仅允许前端域名访问。
- **输入验证**：使用 Zod 验证所有请求体，防止恶意注入。
- **数据隔离**：所有数据库查询均带有 `user_id` 过滤，由 Repository 层自动注入。
- **文件存储**：R2 桶为私有，通过签名 URL 临时访问。
- **日志脱敏**：不记录用户邮箱、姓名等敏感信息。
- **文件类型检查**：服务端验证 MIME 类型和文件头，防止恶意文件上传。
- **病毒扫描**（可选）：未来可集成云杀毒服务，对上传文件进行扫描。

---

## 18. 部署 Cloudflare Workers 流程

### 18.1 前置准备
- 注册 Cloudflare 账号
- 安装 Node.js 18+ 和 npm
- 安装 Wrangler CLI：`npm install -g wrangler`
- 登录 Cloudflare：`wrangler login`

### 18.2 配置 wrangler.toml
```toml
name = "ai-task-assistant"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = [ "nodejs_compat" ]   # 开启 Node.js 兼容，减少包体积

[[d1_databases]]
binding = "DB"
database_name = "task-assistant-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "FILES"
bucket_name = "task-assistant-files"

[vars]
GEMINI_API_KEY = "your-key"
SERPER_API_KEY = "your-key"
LLM_PROVIDER = "gemini"
LLM_MODEL = "gemini-2.0-flash-lite"

[env.production]
vars = { GEMINI_API_KEY = "prod-key", ... }
```

> 开启 `nodejs_compat` 后，可直接使用 Cloudflare 内置的 Node.js 核心 API（如 `Buffer`、`EventEmitter`），这些 API 不计入 Worker 体积，有助于进一步缩小最终 bundle。

### 18.3 初始化 D1 数据库
```bash
# 创建数据库
wrangler d1 create task-assistant-db

# 运行迁移
wrangler d1 migrations apply task-assistant-db
```

### 18.4 构建与部署
```bash
# 安装依赖
npm install

# 构建
npm run build

# 部署到 preview
wrangler deploy --env preview

# 部署到 production
wrangler deploy --env production
```

### 18.5 设置环境变量（Secret）
```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put SERPER_API_KEY
```

### 18.6 绑定自定义域名（可选）
在 Cloudflare Dashboard 的 Workers 页面，添加路由或自定义域名。

### 18.7 监控与日志
- 实时日志：`wrangler tail`
- Dashboard 查看请求日志和错误报告。

---

## 19. 总结

本技术设计方案基于 Cloudflare Workers + TypeScript + Hono 构建，通过抽象层实现 LLM、向量数据库、关系数据库、文件存储的灵活替换。采用 SSE 实现流式对话，类结构和目录清晰，易于维护和扩展。

在 Agent 实现上，我们选择了轻量自研方案，包含 ReAct 循环、工具调用、子代理规划；**TOT/GOT 为可选增强**，与 PRD v1.1 验收解耦。LLM 调用方面，设计了模板化 Prompt、多层次上下文管理、生成质量评估和完整的 token 成本跟踪框架，确保可观测性和成本可控。

个人工作空间与文件管理模块支持拖拽上传、进度反馈、语义类型与 **folder_path / tags**、**对话侧 `manage_workspace_files` 工具**，并与 SSE **`tool_result_meta` / `citation`** 事件配合实现 PRD 要求的来源悬停展示。Serper 侧通过 **`serper_usage`** 满足按用户按日的频率与成本提示。

数据层通过 **`preferences_json`、`detail_json`、`serper_usage`** 及文件处理策略表（第 4.5 节）与 PRD v1.1 对齐；`projects` 仍为可选扩展。部署流程完整，可快速上线验证。

**文档结束**