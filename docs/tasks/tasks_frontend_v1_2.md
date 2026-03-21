# 前端开发任务列表（按时间顺序）

本文档基于 [前端技术设计方案 v1.2](../technical/tech_design_frontend_v1_2.md) 与产品需求文档拆解任务，按阶段组织。任务粒度以 1 小时为单位，便于进度跟踪。可并行执行的任务放在同一阶段内并列列出。

---

## 阶段一：项目初始化与基础架构（预计总工时：9h）

### 任务 1.1：项目脚手架搭建（2h）
- 使用 Vite + React 18 + TypeScript 初始化项目。
- 配置 Tailwind CSS、PostCSS、Autoprefixer。
- 配置 ESLint、Prettier。
- 设置路径别名（如 `@/` 指向 `src/`）。
- 配置环境变量 **`VITE_API_BASE`**（开发可用 `server.proxy` 兜底，**生产必须以该变量为唯一 API 根**，与技术方案 §5.1 一致）。

### 任务 1.2：基础工具与类型定义（3h）
- 安装依赖：`react-router-dom`、`zustand`、`react-hot-toast`、`idb`、`lodash`（按需）。
- 编写全局类型（`src/types/`）：`user.ts`（含 **`preferences?: Record<string, unknown>`**）、`task.ts`（含 **`detail` / `detail_json`** 等与后端一致字段）、`file.ts`（**`folder_path`、`tags`、`processed`**）、`chat.ts`。
- 新增 **`src/types/sse.ts`**（或与 `chat.ts` 拆分）：`SseEvent`、`ToolResultMeta`、`CitationPayload` 等，与后端 SSE 事件对齐（技术方案 §5.3、`lib/chat-stream`）。
- 实现通用工具函数：时间格式化、文件大小转换、防抖节流。

### 任务 1.3：HTTP 客户端封装（2h）
- 实现 `src/api/client.ts`：封装 `fetch`，**`request<T>` + `apiUrl(path)`**（拼接 `VITE_API_BASE`），自动携带 Token，统一 JSON / `FormData` 行为（技术方案 §5.1）。
- 统一错误处理；对 **HTTP 413** 给出明确文案（**单文件不超过 64MB**，技术方案 §10）。
- 实现请求重试（网络错误，最多 2 次）；**401** 跳转登录。

### 任务 1.4：路由配置与守卫（2h）
- 配置基础路由（`/`、`/files`、`/settings`、`/login`）。
- 实现 `RequireAuth`，检查登录状态。
- 实现首次访问引导（未登录跳转 `/login`，登录后回跳原页面）。

---

## 阶段二：全局状态与用户模块（预计总工时：7h）

### 并行任务组 A（可并行执行，总工时：4h）

#### 任务 2.1：用户状态管理（Zustand）（2h）
- 创建 `src/store/userStore.ts`：用户信息（**含 `preferences`**）、AI 昵称、与 Token 协同。
- 实现 `setUser`、`setAiNickname`、**`setPreferences`**、`clearUser`。
- 持久化中间件：`user` / `token` 与 **`preferences` 摘要**写入 localStorage，与 `GET/PUT /api/user` 一致（技术方案 §4、§7）。

#### 任务 2.2：UI 状态管理（2h）
- 创建 `src/store/uiStore.ts`：全局加载、侧边栏折叠、通知队列。
- 增加对话相关态：**`chatStatus`**（如 `idle` | `thinking` | `searching` | `researching`），供 **SSE `intention`** 或工具起止驱动「正在搜索…」「正在整理研究结果…」等（技术方案 §6.2.5、§7）。

### 并行任务组 B（可并行执行，总工时：3h）

#### 任务 2.3：用户信息 API 封装（1h）
- 创建 `src/api/user.ts`：`getUser`、`updateUser`（**支持 `preferences`**）、`setAiNickname`。
- 类型与 `client` 集成。

#### 任务 2.4：登录与空资料态（2h）
- 实现 `/login`：建立 Token / 会话（技术方案 §8.2：**身份仍须由登录或等价流程建立**）。
- 对话页支持 **资料未全量时的空资料态**：不阻塞进入 Chat，与 PRD「AI 在对话内引导补全」一致；设置页作为补充入口。

---

## 阶段三：对话模块（预计总工时：18h）

### 并行任务组 C（可并行执行，总工时：11h）

#### 任务 3.1：对话流与 SSE 集成（4h）
- 安装 `ai`、`@ai-sdk/react`（若采用）。
- **流式 URL 必须使用 `apiUrl('/api/chat/stream')`**，禁止生产环境依赖无前缀 `'/api/...'` 指向前端 origin（技术方案 §5.1、§5.3）。
- 实现 **`src/lib/chat-stream.ts`** + **`useChatStream`（或等价）**：解析 SSE，消费 **`token`、`tool_call`、`tool_result_meta`、`citation`、`done`**，可选 **`intention`**；将元数据挂到当前 assistant 消息或 Store（技术方案 §5.3）。
- 若 `useChat` 无法透传自定义事件，采用 **`fetch` + `ReadableStream` 自解析** 或与官方 **transport / `experimental_transform`** 组合（以所用 `ai` 版本为准）。

#### 任务 3.2：消息渲染组件（3h）
- 实现 `Message`：用户 / AI 样式区分；`react-markdown` + `remark-gfm` + `rehype-highlight`；复制代码块。
- 解析 `<rag>` / `<tool>`：**优先与 SSE `citation` / `tool_result_meta` 关联**，标签解析作降级（技术方案 §6.2.1）。

#### 任务 3.3：工具标记与 RAG 引用 UI（4h）
- 实现 **`ToolCallMark.tsx`**：悬浮数据主要来自 **`tool_result_meta`**（无事件时降级正文解析）。
- 实现 **`RagCitation.tsx`**：绑定 **`citation`** 与正文 `<rag>`（技术方案 §6.1、§6.2.2）。
- 悬浮层：`react-popper` 或 CSS 定位。

### 并行任务组 D（可并行执行，总工时：7h）

#### 任务 3.4：输入框组件（2h）
- `ChatInput`：多行、回车发送、Shift+Enter 换行；发送中禁用与思考态动画；**中止进行中的流式请求**。

#### 任务 3.5：任务侧边栏与任务 API（3h）
- 实现 `src/api/tasks.ts`（或经 `useTasks` 封装）：`list`（**`status`、`project_id` 查询**）、`create` / `update` / `delete`，类型含 **`detail`**（技术方案 §5.2）。
- `TaskSidebar`：列表与筛选；点击插入快捷指令；完成 / 删除等操作。
- **展示或展开任务 `detail` / 子任务信息**（与对话互补，技术方案 §3 任务模块）。

#### 任务 3.6：对话错误、重试与限流提示（2h）
- 流式 / `useChat` `onError`：`toast` 提示；消息级重试。
- **Serper 软限、降级等后端文案**：在气泡或 toast 中原样友好展示，不阻断其它能力（技术方案 §6.2.5、PRD 2.6.2）。

---

## 阶段四：个人工作空间（文件管理）（预计总工时：22h）

### 并行任务组 E（可并行执行，总工时：12h）

#### 任务 4.1：文件列表组件（3h）
- `FileList`：网格 / 列表切换；**`GET /api/files` 支持 `?folder=`、`?type=`**（技术方案 §5.2）；可选 **`FolderBreadcrumb`** 与 folder 前缀一致。
- **`FileCard`**：文件名、大小、时间、语义类型、**`tags`**、**`folder_path`**、**`processed`**（`0` / `1` / `-1` 态与提示，技术方案 §6.2.3）。
- 操作：重命名、删除、下载、改语义类型、**编辑 tags（`PUT /api/files/:id/tags`）**。

#### 任务 4.2：上传核心逻辑（双路径 + 分片）（5h）
- 实现 **`useFileUpload`**：
  - 选择后 **客户端校验 `size <= 64MB`**，否则中止并提示（技术方案 §6.2.4、§11）。
  - **小文件**（与后端约定如 **≤5MB**）：`FormData` → **`POST /api/files/upload`**（字段 `file`、`semantic_type`，可选 **`folder_path`、`tags`（JSON 字符串）**）。
  - **更大且 ≤64MB**：`initiate-multipart` → 分片 `PUT` 预签名 URL → **`complete-multipart` 提交 `upload_id`、`r2_key`（来自 initiate 响应）、`parts`**（技术方案 §11）。
- XHR `upload.onprogress`、失败与分片级 / 整单重试。

#### 任务 4.3：上传进度与状态反馈（4h）
- `UploadProgress`、占位虚线节点、完成实线、失败红框与重试（PRD 2.5.3）。
- 成功 / 失败：**toast + 可选 `Notification`**（与阶段五可合并验收）。

### 并行任务组 F（可并行执行，总工时：10h）

#### 任务 4.4：拖拽上传区域（2h）
- `react-dropzone`；点击选择文件。

#### 任务 4.5：元数据弹窗（2h）
- `SemanticTypeModal`（`react-hook-form`）：必填语义类型；可选 **`folder_path`、初始 `tags`**（技术方案 §6.2.4）。
- 语义类型选项：后端或预定义列表。

#### 任务 4.6：文件操作 API 封装（2h）
- `src/api/files.ts`：**`list`（query）**、**`uploadSmall`**、**`initiateMultipart`**、**`completeMultipart`**、**`updateTags`**、`delete`、`rename`、`updateSemanticType`、`download`（技术方案 §5.2）。
- 下载：签名 URL 触发浏览器下载。

#### 任务 4.7：文件搜索、筛选与排序（2h）
- 文件名搜索（防抖）、语义类型筛选、排序（时间 / 名称 / 大小）。
- **`useFiles`（可选）**：与列表刷新、缓存 key 策略配合（技术方案 §9）。

#### 任务 4.8：Hooks 与 IndexedDB 键策略（2h）
- `useFiles` / `useFileUpload` 与 API、Store 边界清晰。
- 文件列表缓存：**按 `folder` 前缀或查询串区分 IndexedDB key**，避免陈旧数据（技术方案 §4.1、§9）。

---

## 阶段五：系统集成与用户体验优化（预计总工时：13h）

### 并行任务组 G（可并行执行，总工时：13h）

#### 任务 5.1：全局通知与错误处理（2h）
- `react-hot-toast` 统一 success / error。
- 上传成功 / 失败：**Notification API**（用户授权后，技术方案 §1 选型表）。

#### 任务 5.2：用户设置页面（3h）
- `/settings`：用户信息、**偏好 `preferences` 表单**（`PUT /api/user` 与 Store 同步）、AI 昵称（技术方案 §8.1、§7.2）。

#### 任务 5.3：离线缓存策略（3h）
- `idb` 封装；文件列表离线读取与 **离线提示**。
- 与 **folder / tags 变更** 的失效或分区策略一致（技术方案 §4.1）。

#### 任务 5.4：响应式与移动端适配（2h）
- Tailwind 断点；对话侧栏可折叠；工作空间网格小屏单列。

#### 任务 5.5：性能优化与代码分割（2h）
- `React.lazy`：`/files`、`/settings`（及技术方案建议的 Chat 等按需分割）。
- `useMemo` / `useCallback` 优化长列表；可选虚拟滚动（技术方案 §9）。

#### 任务 5.6：本地存储与持久化（1h）
- localStorage：`user`（含 **preferences 摘要**）、`token`；与后端拉取一致。

---

## 阶段六：测试与部署（预计总工时：13h）

### 并行任务组 H（可并行执行，总工时：13h）

#### 任务 6.1：单元测试与组件测试（4h）
- Vitest + RTL：**SSE 解析**、**上传状态机**、**64MB 校验**；`Message` + 引用、`ToolCallMark`、`FileCard`（**`processed` 态**）、工具函数（技术方案 §14）。

#### 任务 6.2：端到端测试（Playwright）（5h）
- 登录 → 对话；**流式对话与元数据**（若有稳定桩）。
- 任务列表与 **detail**；**小文件与分片上传**（含 **`r2_key` 完成流**）；**tags / folder**；**preferences**；修改 AI 昵称；离线缓存展示。

#### 任务 6.3：构建与部署（4h）
- Vite 生产构建；部署 Cloudflare Pages / Vercel；**生产环境变量 `VITE_API_BASE`**；CORS 由后端配置（技术方案 §12）。

---

## 总工时估算汇总

| 阶段 | 工时 |
|------|------|
| 阶段一：项目初始化与基础架构 | 9h |
| 阶段二：全局状态与用户模块 | 7h |
| 阶段三：对话模块 | 18h |
| 阶段四：个人工作空间（文件管理） | 22h |
| 阶段五：系统集成与用户体验优化 | 13h |
| 阶段六：测试与部署 | 13h |
| **总计** | **82h** |

按每日有效工作 6 小时计算，约需 **14 个工作日**（不含并行优化）。并行任务可多人同时进行，实际交付周期可缩短。

---

## 并行执行建议

- **阶段三**：组 C（SSE、消息、ToolCallMark/RagCitation）与组 D（输入框、任务侧栏含 tasks API、错误与限流文案）可并行，2 人约 4 天量级。
- **阶段四**：组 E（列表、双路径上传、进度）与组 F（拖拽、弹窗含 folder/tags、完整 files API、搜索、IndexedDB 键）可并行，2 人约 4～5 天量级。
- **阶段五、六** 可与功能开发中后期穿插（测试用例、部署流水线）。

任务列表随 [tech_design_frontend_v1_2.md](../technical/tech_design_frontend_v1_2.md) 与后端 §5 契约变更而修订，**以仓库内设计与 OpenAPI（若有）为单一事实来源**。
