# 前端开发任务列表（按时间顺序）

本文档基于 [前端技术设计方案 v1.2](../technical/tech_design_frontend_v1_2.md)（含 PRD v1.2 / 文档版本 1.5 起之会话与匿名登录约定）与产品需求文档拆解任务，按阶段组织。任务粒度以 1 小时为单位，便于进度跟踪。可并行执行的任务放在同一阶段内并列列出。

**路径约定**：仓库根目录下以 **`frontend/`** 存放前端工程（与 **`backend/`** 并列，见技术方案「仓库与路径约定」）。**本文所有实现落点一律写仓库相对完整路径**（形如 **`frontend/src/...`**），不写省略形式，避免与 `backend/src` 或包内相对路径混淆。在 `frontend/` 包内配置 Vite 别名时仍可将 `@/` 指到该包下的 `src/`。

**阶段一至三（已完成）与阶段四的关系**：**阶段一、二、三**在任务文档中的描述**保持原验收口径不变**（不在此回头改写已交付范围）。与 [技术方案](../technical/tech_design_frontend_v1_2.md) **PRD v1.2 / 文档 1.5**（匿名登录、`session_id`、会话列表、主对话布局等）相关的**契约对齐与改造**，**一律在阶段四及以后任务中落地**；后端同步演进时，以前后端**最新 OpenAPI / 实现**为准，阶段四按新模式更新 **`frontend/src`** 即可。

---

## 阶段一：项目初始化与基础架构（预计总工时：9h）

### 任务 1.1：项目脚手架搭建（2h）
- 在仓库根目录的 **`frontend/`** 下使用 Vite + React 18 + TypeScript 初始化项目（与 **`backend/`** 分离，勿混装依赖）；入口为 **`frontend/src/main.tsx`** 挂载 **`frontend/src/App.tsx`**。
- 配置 Tailwind CSS、PostCSS、Autoprefixer。
- 配置 ESLint、Prettier。
- 设置路径别名（如 `@/` 指向前端包内 `src/`，即仓库中的 **`frontend/src/`**）。
- 配置环境变量 **`VITE_API_BASE`**（开发可用 `server.proxy` 兜底，**生产必须以该变量为唯一 API 根**，与技术方案 §5.1 一致）。

### 任务 1.2：基础工具与类型定义（3h）
- 安装依赖：`react-router-dom`、`zustand`、`react-hot-toast`、`idb`、`lodash`（按需）。
- 编写全局类型：**`frontend/src/types/user.ts`**（含 **`preferences?: Record<string, unknown>`**）、**`frontend/src/types/task.ts`**（含 **`detail` / `detail_json`** 等与后端一致字段）、**`frontend/src/types/file.ts`**（**`folder_path`、`tags`、`processed`**）、**`frontend/src/types/chat.ts`**。
- 新增 **`frontend/src/types/sse.ts`**（或与 `chat.ts` 拆分）：`SseEvent`、`ToolResultMeta`、`CitationPayload` 等，与后端 SSE 事件对齐（技术方案 §5.3、**`frontend/src/lib/chat-stream.ts`**）。
- 实现通用工具函数（**`frontend/src/lib/utils.ts`**）：时间格式化、文件大小转换、防抖节流。

### 任务 1.3：HTTP 客户端封装（2h）
- 实现 **`frontend/src/api/client.ts`**：封装 `fetch`，**`request<T>` + `apiUrl(path)`**（拼接 `VITE_API_BASE`），自动携带 Token，统一 JSON / `FormData` 行为（技术方案 §5.1）。
- 统一错误处理；对 **HTTP 413** 给出明确文案（**单文件不超过 64MB**，技术方案 §10）。
- 实现请求重试（网络错误，最多 2 次）；**401** 跳转登录。

### 任务 1.4：路由配置与守卫（2h）
- **`frontend/src/App.tsx`**：`BrowserRouter`、全局 Provider（如后续 Toaster）；嵌套 **`frontend/src/components/layout/AppShell.tsx`**（内嵌 **`frontend/src/components/layout/Header.tsx`**、**`frontend/src/components/layout/Sidebar.tsx`** 与 `<Outlet />`，技术方案 §6.1）。
- 在 **`frontend/src/router/index.tsx`** 配置基础路由（`/`、`/files`、`/settings`、`/login`），`lazy` 指向 **`frontend/src/pages/Chat/index.tsx`**、**`frontend/src/pages/Files/FileWorkspace.tsx`**、**`frontend/src/pages/Settings/index.tsx`**、**`frontend/src/pages/Login/index.tsx`**。
- 在 **`frontend/src/router/guards.ts`**（或与 **`frontend/src/components/auth/RequireAuth.tsx`** 协同）实现鉴权逻辑；**`frontend/src/components/auth/RequireAuth.tsx`** 包裹需登录路由，检查登录状态。
- 实现首次访问引导（未登录跳转 `/login`，登录后回跳原页面）。

---

## 阶段二：全局状态与用户模块（预计总工时：7h）

### 并行任务组 A（可并行执行，总工时：4h）

#### 任务 2.1：用户状态管理（Zustand）（2h）
- 创建 **`frontend/src/store/userStore.ts`**：用户信息（**含 `preferences`**）、AI 昵称、与 Token 协同。
- 实现 `setUser`、`setAiNickname`、**`setPreferences`**、`clearUser`。
- 持久化中间件：`user` / `token` 与 **`preferences` 摘要**写入 localStorage，与 `GET/PUT /api/user` 一致（技术方案 §4、§7）。

#### 任务 2.2：UI 状态管理（2h）
- 创建 **`frontend/src/store/uiStore.ts`**：全局加载、侧边栏折叠、通知队列。
- 增加对话相关态：**`chatStatus`**（如 `idle` | `thinking` | `searching` | `researching`），供 **SSE `intention`** 或工具起止驱动「正在搜索…」「正在整理研究结果…」等（技术方案 §6.2.5、§7）。

### 并行任务组 B（可并行执行，总工时：3h）

#### 任务 2.3：用户信息 API 封装（1h）
- 创建 **`frontend/src/api/user.ts`**：`getUser`、`updateUser`（**支持 `preferences`**）、`setAiNickname`。
- 类型与 **`frontend/src/api/client.ts`** 集成。

#### 任务 2.4：登录与空资料态（2h）
- 实现 **`frontend/src/pages/Login/index.tsx`**（路由 `/login`）：建立 Token / 会话（技术方案 §8：**身份仍须由登录或等价流程建立**）。
- **`frontend/src/pages/Chat/index.tsx`** 支持 **资料未全量时的空资料态**：不阻塞进入 Chat，与 PRD「AI 在对话内引导补全」一致；**`frontend/src/pages/Settings/index.tsx`** 作为补充入口。阶段三在同一 Chat 页挂载的组件以 [技术方案 §6.1](../technical/tech_design_frontend_v1_2.md) 所列 **`frontend/src/components/chat/`**、**`frontend/src/components/tasks/`** 下文件为准（逐文件完整路径见该节树状图）。

---

## 阶段三：对话模块（预计总工时：18h）

### 并行任务组 C（可并行执行，总工时：11h）

#### 任务 3.1：对话流与 SSE 集成（4h）
- 安装 `ai`、`@ai-sdk/react`（若采用）。
- **流式 URL 必须使用 `apiUrl('/api/chat/stream')`**，禁止生产环境依赖无前缀 `'/api/...'` 指向前端 origin（技术方案 §5.1、§5.3）。
- 实现 **`frontend/src/lib/chat-stream.ts`** + **`frontend/src/hooks/useChatStream.ts`**（或同目录等价 Hook）：解析 SSE，消费 **`token`、`tool_call`、`tool_result_meta`、`citation`、`done`**，可选 **`intention`**；将元数据挂到当前 assistant 消息或 **`frontend/src/store/userStore.ts`** / **`frontend/src/store/uiStore.ts`**（技术方案 §5.3）。与 **`intention`** 对应的展示可接 **`frontend/src/components/chat/ChatStatusIndicator.tsx`**（技术方案 §6.1）。
- 若 `useChat` 无法透传自定义事件，采用 **`fetch` + `ReadableStream` 自解析** 或与官方 **transport / `experimental_transform`** 组合（以所用 `ai` 版本为准）。

#### 任务 3.2：消息渲染组件（3h）
- 实现 **`frontend/src/components/chat/Message.tsx`**：用户 / AI 样式区分；`react-markdown` + `remark-gfm` + `rehype-highlight`；复制代码块。
- 可选实现 **`frontend/src/components/chat/MessageList.tsx`**（长列表与虚拟滚动，技术方案 §9）。
- 解析 `<rag>` / `<tool>`：**优先与 SSE `citation` / `tool_result_meta` 关联**，标签解析作降级（技术方案 §6.2.1）。

#### 任务 3.3：工具标记与 RAG 引用 UI（4h）
- 实现 **`frontend/src/components/chat/ToolCallMark.tsx`**：悬浮数据主要来自 **`tool_result_meta`**（无事件时降级正文解析）。
- 实现 **`frontend/src/components/chat/RagCitation.tsx`**：绑定 **`citation`** 与正文 `<rag>`（技术方案 §6.1、§6.2.2）。
- 悬浮层：`react-popper` 或 CSS 定位。

### 并行任务组 D（可并行执行，总工时：7h）

#### 任务 3.4：输入框组件（2h）
- **`frontend/src/components/chat/ChatInput.tsx`**：多行、回车发送、Shift+Enter 换行；发送中禁用与思考态动画；**中止进行中的流式请求**（与 **`frontend/src/hooks/useChatStream.ts`** 协作）。

#### 任务 3.5：任务侧边栏与任务 API（3h）
- 实现 **`frontend/src/api/tasks.ts`**（或经 **`frontend/src/hooks/useTasks.ts`** 封装）：`list`（**`status`、`project_id` 查询**）、`create` / `update` / `delete`，类型含 **`detail`**（技术方案 §5.2）。
- **`frontend/src/components/tasks/TaskSidebar.tsx`**：列表与筛选；点击插入快捷指令；完成 / 删除等操作；与 **`frontend/src/components/tasks/TaskItem.tsx`** 配合。
- **`frontend/src/components/tasks/TaskDetailPanel.tsx`**：**展示或展开任务 `detail` / 子任务信息**（与对话互补，技术方案 §3 任务模块）。

#### 任务 3.6：对话错误、重试与限流提示（2h）
- 流式 / `useChat` `onError`：`toast` 提示；消息级重试（逻辑可放在 **`frontend/src/hooks/useChatStream.ts`** 或 **`frontend/src/pages/Chat/index.tsx`**）。
- **Serper 软限、降级等后端文案**：在 **`frontend/src/components/chat/Message.tsx`** 气泡或 toast 中原样友好展示，不阻断其它能力（技术方案 §6.2.5、PRD 2.6.2）。

---

## 阶段四：匿名登录、会话列表与主对话布局（PRD v1.2 / 技术方案 §4.2、§5.2、§6.2.6、§6.2.7、§8）（预计总工时：18h）

**本阶段负责与 v1.2 新模式对齐**（阶段一至三已交付代码的**增量改造与契约收敛**集中在此完成，**不修改**阶段一至三在本文中的任务定义）。

对应技术文档版本 **1.5** 起：**DeepSeek 式主对话区** + 侧栏可折叠 **会话列表**、**`session_id`** 与历史拉取、**`POST /api/auth/login`** 与 **`/api/sessions`** 系列、**登出再登入须重新拉会话与消息**（§4.2、已知实现缺口说明）。

### 并行任务组 I（可并行执行，总工时：9h）

#### 任务 4.1：认证与会话 API 与类型（3h）
- 新增 **`frontend/src/api/auth.ts`**：**`login`**（`POST /api/auth/login`，body：`name` 必填、**`email` 选填**；响应 **`token`、`user`、`is_new_user`**）；可选 **`profileExists(name)`**（路径与 query 以**后端最终实现**为准，用于按钮文案预切换）。
- 新增 **`frontend/src/api/sessions.ts`**：**`list`**、**`create`（POST）**、**`messages(sessionId, { cursor?, limit? })`**、**`rename(sessionId, title)`（PATCH）**；类型 **`ChatSession`**（`id`、`title`、`created_at`、`updated_at`）与 **`frontend/src/types/chat.ts`** 中消息类型对齐列表接口。
- 同步 **`frontend/src/types/user.ts`**：**`email` 可为空**（`string | null | undefined`，与 PRD v1.2、技术方案 §5.2 一致）。
- 更新 **`frontend/src/types/chat.ts`** 中流式请求体类型（如 **`ChatStreamRequestBody`**）：与后端一致使用 **`session_id`**；若后端不再使用旧字段，则移除或替换原 **`conversation_id`** 约定（以 OpenAPI/实现为准）。
- **`frontend/src/lib/user-from-api.ts`**（若存在）：解析登录 / `GET /api/user` 响应时兼容 **可空邮箱**。

#### 任务 4.2：chatSessionStore 与登录后 bootstrap（3h）
- 新增 **`frontend/src/store/chatSessionStore.ts`**（或按技术方案并入 uiStore，但职责建议独立）：**会话列表**、**当前 `activeSessionId`**、**加载态**；方法含 **`setSessions`、`setActiveSessionId`、`upsertSession`、`removeSession`** 等。
- **localStorage** 可选键 **`activeSessionId`**（技术方案 §4.1）；**登录成功后须先 `GET /api/sessions` 再渲染会话 UI**，并与持久化 id **校验仍存在**。
- **登出再登入**：**重新请求会话列表与各会话消息**，不得以空状态覆盖已持久化历史（技术方案「已知实现缺口」、PRD v1.2 §5.9-B）；与 **`RequireAuth`** 登录成功路径协同。
- **`frontend/src/store/userStore.ts` 的 `clearUser`**：同时 **重置 `chatSessionStore`**（列表、当前会话、内存消息状态由 Chat 页/Hook 协同清空），并 **清除 `activeSessionId` 的 localStorage**，避免登出后残留 id。

#### 任务 4.3：匿名登录页与落地视觉（3h）
- 改造 **`frontend/src/pages/Login/index.tsx`**（技术方案 §6.2.7、§8.1）：主路径为表单 **名称必填**、**邮箱选填**，提交 **`authAPI.login`**；替代或收敛原 **粘贴 Token / 仅开发用** 入口（若保留，限于 **`import.meta.env.DEV`** 或文档明示的运维场景，避免与产品主流程混淆）。
- **失焦预检**：可选调用 **`profileExists`**，**`exists: false` →「开始吧」**，**`exists: true` →「欢迎回来」**（仅文案，不替代正式登录）。
- 成功：写入 **`userStore` / `token`**，并按 **4.2** 拉会话；**`is_new_user`** 区分成功反馈（toast 等）。
- **视觉**：深色渐变、微粒/网格或柔和光晕等 **科技感**（控制性能与对比度），**不削弱表单可读性**。
- **`frontend/src/lib/profile.ts`** 与 **`frontend/src/pages/Chat/index.tsx`**：**`isProfileIncomplete`** 与空资料横幅按 v1.2 调整——**邮箱可空，不因缺邮箱视为「资料不完整」**；缺省仅 **`name`** 等仍与 PRD 首轮补全策略一致（与设置页补充入口配合）。

### 并行任务组 J（可并行执行，总工时：9h）

（组 J 与组 I 可并行；**4.5** 依赖 **4.1～4.2** 的类型与 Store，**4.4** 依赖 **4.2** 的列表数据。）

#### 任务 4.4：侧栏会话列表与重命名（4h）
- 实现 **`frontend/src/components/chat/SessionList.tsx`**、**`frontend/src/components/chat/SessionListItem.tsx`**、**`frontend/src/components/chat/SessionRenameInline.tsx`**（技术方案 §6.1）：列表按 **`updated_at` 排序**；**当前 `sessionId` 高亮**。
- 改造 **`frontend/src/components/layout/Sidebar.tsx`**：在「对话」导航下增加 **可折叠面板**，内嵌 **`SessionList`**；与 **`frontend/src/store/uiStore.ts`** 侧栏折叠协同。
- **`SessionListItem`**：**右键**（原生 `contextmenu` 或自定义菜单）→「修改名称」→ 行内 **`SessionRenameInline`**，**失焦/回车** 调 **`sessionsAPI.rename`**，成功后更新 Store。

#### 任务 4.5：Chat 主区布局、历史与流式 session_id（5h）
- 改造 **`frontend/src/pages/Chat/index.tsx`**（技术方案 §6.2.6、§13）：**中间主栏单列**消息流 + 底部输入（视觉参考 DeepSeek：**宽屏居中、留白**）；任务/文件入口仍在侧栏，**不把任务列表挤占主对话区**。
- **切换会话**：**`setActiveSessionId`** → **`GET /api/sessions/:id/messages`** 填充 **`MessageList`** / 消息状态；**新对话**：**`POST /api/sessions`** 后选中新 **`id`**。
- **`frontend/src/lib/chat-stream.ts`** 的 **`consumeChatStream`**：POST body **必须携带当前 `session_id`**（与 **`chatSessionStore`** 一致）；与阶段三已实现的 SSE 解析逻辑**合并**，仅替换/扩展请求体字段（**以后端字段名为准**，与 **4.1** 类型一致）。
- **`frontend/src/hooks/useChatStream.ts`**：从 Store 或 props 读取 **`activeSessionId`**，无有效会话时禁止发送或先 **`create` 会话**；移除对仅 **`conversation_id`** 的依赖（若后端已废弃）。
- **`frontend/src/components/chat/ChatInput.tsx`**：与 **`useChatStream` / Chat 页** 协同，保证发起流式时始终附带 **同一 `session_id`**。
- 流式结束后可 **`sessionsAPI.list()`** 刷新标题（以后端 **`chat_sessions.title`** 为准）。
- 会话标题展示与阶段三已有 **`Message` / `ChatInput`** 等组件拼装闭环。

---

## 阶段五：个人工作空间（文件管理）（预计总工时：22h）

### 并行任务组 E（可并行执行，总工时：12h）

#### 任务 5.1：文件列表组件（3h）
- **`frontend/src/components/files/FileList.tsx`**：网格 / 列表切换；**`GET /api/files` 支持 `?folder=`、`?type=`**（技术方案 §5.2）；可选 **`frontend/src/components/files/FolderBreadcrumb.tsx`** 与 folder 前缀一致；筛选 / 视图切换可与 **`frontend/src/components/files/FileToolbar.tsx`** 合并实现。
- **`frontend/src/components/files/FileCard.tsx`**：文件名、大小、时间、语义类型、**`tags`**、**`folder_path`**、**`processed`**（`0` / `1` / `-1` 态与提示，技术方案 §6.2.3）。
- 操作：重命名、删除、下载、改语义类型、**编辑 tags（`PUT /api/files/:id/tags`）**（调用 **`frontend/src/api/files.ts`**）。
- 在 **`frontend/src/pages/Files/FileWorkspace.tsx`** 组合 **`frontend/src/components/files/FileList.tsx`**、**`frontend/src/components/files/FileCard.tsx`**、**`frontend/src/components/files/FolderBreadcrumb.tsx`**（可选）、**`frontend/src/components/files/FileToolbar.tsx`**（可与 FileList 合并）、**`frontend/src/components/files/UploadDropzone.tsx`**、**`frontend/src/components/files/UploadProgress.tsx`**、**`frontend/src/components/files/SemanticTypeModal.tsx`** 与 **`frontend/src/hooks/useFiles.ts`** / **`frontend/src/hooks/useFileUpload.ts`**。

#### 任务 5.2：上传核心逻辑（双路径 + 分片）（5h）
- 实现 **`frontend/src/hooks/useFileUpload.ts`**：
  - 选择后 **客户端校验 `size <= 64MB`**，否则中止并提示（技术方案 §6.2.4、§11）。
  - **小文件**（与后端约定如 **≤5MB**）：`FormData` → **`POST /api/files/upload`**（字段 `file`、`semantic_type`，可选 **`folder_path`、`tags`（JSON 字符串）**）。
  - **更大且 ≤64MB**：`initiate-multipart` → 分片 `PUT` 预签名 URL → **`complete-multipart` 提交 `upload_id`、`r2_key`（来自 initiate 响应）、`parts`**（技术方案 §11）。
- XHR `upload.onprogress`、失败与分片级 / 整单重试。

#### 任务 5.3：上传进度与状态反馈（4h）
- **`frontend/src/components/files/UploadProgress.tsx`**：占位虚线节点、完成实线、失败红框与重试（PRD 2.5.3）。
- 成功 / 失败：**toast + 可选 `Notification`**（与阶段六可合并验收；Toast 容器通常在 **`frontend/src/App.tsx`**）。

### 并行任务组 F（可并行执行，总工时：10h）

#### 任务 5.4：拖拽上传区域（2h）
- **`frontend/src/components/files/UploadDropzone.tsx`**：`react-dropzone` 封装；点击选择文件。

#### 任务 5.5：元数据弹窗（2h）
- **`frontend/src/components/files/SemanticTypeModal.tsx`**（`react-hook-form`）：必填语义类型；可选 **`folder_path`、初始 `tags`**（技术方案 §6.2.4）。
- 语义类型选项：后端或预定义列表。

#### 任务 5.6：文件操作 API 封装（2h）
- **`frontend/src/api/files.ts`**：**`list`（query）**、**`uploadSmall`**、**`initiateMultipart`**、**`completeMultipart`**、**`updateTags`**、`delete`、`rename`、`updateSemanticType`、`download`（技术方案 §5.2）。
- 下载：签名 URL 触发浏览器下载。

#### 任务 5.7：文件搜索、筛选与排序（2h）
- 文件名搜索（防抖）、语义类型筛选、排序（时间 / 名称 / 大小）。
- **`frontend/src/hooks/useFiles.ts`（可选）**：与列表刷新、缓存 key 策略配合（技术方案 §9）。

#### 任务 5.8：Hooks 与 IndexedDB 键策略（2h）
- **`frontend/src/hooks/useFiles.ts`** / **`frontend/src/hooks/useFileUpload.ts`** 与 **`frontend/src/api/files.ts`**、**`frontend/src/store/userStore.ts`**（如需）、**`frontend/src/store/uiStore.ts`**（如需）边界清晰。
- 文件列表缓存：**按 `folder` 前缀或查询串区分 IndexedDB key**，避免陈旧数据（技术方案 §4.1、§9）。

---

## 阶段六：系统集成与用户体验优化（预计总工时：13h）

### 并行任务组 G（可并行执行，总工时：13h）

#### 任务 6.1：全局通知与错误处理（2h）
- 在 **`frontend/src/App.tsx`**（或 **`frontend/src/main.tsx`**）挂载 `react-hot-toast` 的 Toaster，统一 success / error。
- 上传成功 / 失败：**Notification API**（用户授权后，技术方案 §1 选型表；调用点可在 **`frontend/src/hooks/useFileUpload.ts`** 或 **`frontend/src/components/files/UploadProgress.tsx`**）。

#### 任务 6.2：用户设置页面（3h）
- **`frontend/src/pages/Settings/index.tsx`**（路由 `/settings`）：用户信息、**偏好 `preferences` 表单**（`PUT /api/user` 与 **`frontend/src/store/userStore.ts`** 同步）、AI 昵称（技术方案 §8.1、§7.2）。

#### 任务 6.3：离线缓存策略（3h）
- `idb` 封装（**`frontend/src/lib/idb.ts`**）；与 **`frontend/src/hooks/useFiles.ts`** / **`frontend/src/pages/Files/FileWorkspace.tsx`** 协同：文件列表离线读取与 **离线提示**。
- 与 **folder / tags 变更** 的失效或分区策略一致（技术方案 §4.1）。

#### 任务 6.4：响应式与移动端适配（2h）
- Tailwind 断点；**`frontend/src/components/layout/Sidebar.tsx`** / **`frontend/src/components/layout/AppShell.tsx`** 对话侧栏可折叠；**`frontend/src/pages/Files/FileWorkspace.tsx`** 与 **`frontend/src/components/files/FileList.tsx`** 工作空间网格小屏单列。

#### 任务 6.5：性能优化与代码分割（2h）
- **`frontend/src/App.tsx`** 或 **`frontend/src/router/index.tsx`** 使用 `React.lazy` 按需加载 **`frontend/src/pages/Files/FileWorkspace.tsx`**、**`frontend/src/pages/Settings/index.tsx`**、**`frontend/src/pages/Chat/index.tsx`** 等（技术方案 §9）。
- `useMemo` / `useCallback` 优化长列表；可选虚拟滚动（**`frontend/src/components/chat/MessageList.tsx`**，技术方案 §9）。

#### 任务 6.6：本地存储与持久化（1h）
- localStorage：`user`（含 **preferences 摘要**）、`token`、**可选 `activeSessionId`**（与阶段四 Store 一致）；与后端拉取一致（读写与 **`frontend/src/store/userStore.ts`**、**`frontend/src/store/chatSessionStore.ts`**、**`frontend/src/api/user.ts`** 对齐）。

---

## 阶段七：测试与部署（预计总工时：13h）

### 并行任务组 H（可并行执行，总工时：13h）

#### 任务 7.1：单元测试与组件测试（4h）
- Vitest + RTL（配置在 **`frontend/vitest.config.ts`** 等）：**`frontend/src/lib/chat-stream.ts`**（SSE 解析）、**`frontend/src/hooks/useFileUpload.ts`**（上传状态机）、**64MB 校验**；**`frontend/src/components/chat/Message.tsx`** + 引用、**`frontend/src/components/chat/ToolCallMark.tsx`**、**`frontend/src/components/files/FileCard.tsx`**（**`processed` 态**）、**`frontend/src/lib/utils.ts`**（技术方案 §14）。测试文件建议与源同目录 **`*.test.ts(x)`** 或 **`frontend/src/__tests__/`**。

#### 任务 7.2：端到端测试（Playwright）（5h）
- 规格目录 **`frontend/e2e/`**（或技术方案 §13 约定路径）：**匿名登录（新用户 / 回访）**、**会话切换与历史**、**右键重命名**；流式对话与元数据（若有稳定桩）。
- 任务列表与 **detail**；**小文件与分片上传**（含 **`r2_key` 完成流**）；**tags / folder**；**preferences**；修改 AI 昵称；离线缓存展示。

#### 任务 7.3：构建与部署（4h）
- 在 **`frontend/`** 目录执行 Vite 生产构建（`npm run build`，读取 **`frontend/vite.config.ts`** 等）；部署 Cloudflare Pages / Vercel 时将**项目根目录指向 `frontend/`**；**生产环境变量 `VITE_API_BASE`**；CORS 由后端配置（技术方案 §12）。

---

## 总工时估算汇总

| 阶段 | 工时 |
|------|------|
| 阶段一：项目初始化与基础架构 | 9h |
| 阶段二：全局状态与用户模块 | 7h |
| 阶段三：对话模块 | 18h |
| 阶段四：匿名登录、会话列表与主对话布局 | 18h |
| 阶段五：个人工作空间（文件管理） | 22h |
| 阶段六：系统集成与用户体验优化 | 13h |
| 阶段七：测试与部署 | 13h |
| **总计** | **100h** |

按每日有效工作 6 小时计算，约需 **17 个工作日**（不含并行优化）。并行任务可多人同时进行，实际交付周期可缩短。

---

## 并行执行建议

- **阶段三**：组 C（**`frontend/src/lib/chat-stream.ts`**、**`frontend/src/hooks/useChatStream.ts`**、**`frontend/src/components/chat/Message.tsx`**、**`frontend/src/components/chat/ToolCallMark.tsx`**、**`frontend/src/components/chat/RagCitation.tsx`**）与组 D（**`frontend/src/components/chat/ChatInput.tsx`**、**`frontend/src/components/tasks/TaskSidebar.tsx`**、**`frontend/src/api/tasks.ts`**、错误与限流文案）可并行，2 人约 4 天量级。
- **阶段四**：组 I（**`auth`/`sessions` API**、**类型与 `ChatStreamRequestBody`**、**`chatSessionStore`/`clearUser` 联动**、**登录页与 `profile`**）与组 J（**`SessionList`**、**`Sidebar`**、**`Chat` 主区**、**`consumeChatStream`/`useChatStream` 的 `session_id`**）可并行；**4.5** 依赖 **4.1～4.2**，宜在阶段三流式与消息组件基本可用后联调。
- **阶段五**：组 E（**`frontend/src/components/files/FileList.tsx`**、**`frontend/src/components/files/FileCard.tsx`**、**`frontend/src/hooks/useFileUpload.ts`**、**`frontend/src/components/files/UploadProgress.tsx`**）与组 F（**`frontend/src/components/files/UploadDropzone.tsx`**、**`frontend/src/components/files/SemanticTypeModal.tsx`**、**`frontend/src/api/files.ts`**、**`frontend/src/hooks/useFiles.ts`**、IndexedDB 键）可并行，2 人约 4～5 天量级。
- **阶段六、七** 可与功能开发中后期穿插（测试用例、部署流水线）。

任务列表随 [tech_design_frontend_v1_2.md](../technical/tech_design_frontend_v1_2.md)（含 **`frontend/`** 路径约定、**PRD v1.2 / 文档 1.5** 会话与认证变更）与后端 §5 契约变更而修订，**以仓库内设计与 OpenAPI（若有）为单一事实来源**。
