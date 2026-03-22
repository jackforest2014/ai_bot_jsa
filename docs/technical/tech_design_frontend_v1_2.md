# 前端技术设计方案（v1.2，对齐 PRD v1.2）

## 文档版本

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-21 | AI Assistant | 初稿完成 |
| 1.2 | 2026-03-21 | AI Assistant | 对齐 [PRD v1.1](../products/ai_bot_v1_1.md) 与后端 [tech_design_ai_bot_v1_2.md](./tech_design_ai_bot_v1_2.md)（§5.x）：SSE `tool_result_meta`/`citation`、`preferences`、任务 `detail`、文件 `folder_path`/`tags`/`processed`、完整 files API、小文件/分片双路径、64MB 校验、浏览器通知、搜索/研究态与配额提示、登录与 AI 引导关系说明 |
| 1.3 | 2026-03-21 | AI Assistant | §6.1、§13：由「增量片段」改为**完整目录约定**（`src/components/` 全树 + 全量 `src/` 与根配置），与 §3 模块表及 [tasks_frontend_v1_2.md](../tasks/tasks_frontend_v1_2.md) 中的路径、组件名对齐 |
| 1.4 | 2026-03-21 | AI Assistant | 与仓库布局对齐：**前端工程根为 `frontend/`**（与根目录 **`backend/`** 并列）；§3 关键路径、§6.1 / §13 树状结构均以 `frontend/` 为前缀；代码片段中 `// src/...` 注释仍表示 `frontend/src/...` |
| 1.5 | 2026-03-21 | AI Assistant | 对齐 [PRD v1.2](../products/ai_bot_v1_1.md) 与后端 **§1.4**：DeepSeek 式主对话区 + 可折叠会话列表、`session_id` 与历史拉取、匿名登录页（名称必填/邮箱选填、「开始吧」/「欢迎回来」）、会话右键重命名、落地页科技感视觉；`POST /api/auth/login`、`/api/sessions` 系列 |

### 与 PRD / 后端的范围说明

- **仓库与路径约定**：本仓库在根目录下以 **`frontend/`** 存放前端工程（与 **`backend/`** 并列）。**§3 模块表「关键文件」、§6.1、§13** 中的路径均相对于 **`frontend/`**（即从仓库根看为 `frontend/src/...`）。文中 TypeScript 示例顶部的 `// src/...` 注释沿用 Vite 习惯，含义同上。
- **以后端契约为准**：接口路径、请求体字段、SSE 事件名以 `tech_design_ai_bot_v1_2.md`（含 **§5.0、§5.1.1**）为准；若后端变更，前端类型与 Hook 应同步更新。
- **PRD 2.5.1 文件夹**：v1.1 可采用 **逻辑路径 `folder_path` + `GET ?folder=`**（与后端一致），完整「创建文件夹」树形 UI 可作为后续迭代。
- **流式对话**：除正文 token 外，须消费 **`tool_result_meta`、`citation`（及可选 `intention`）** 以满足 PRD 2.1-4、5.6（悬停展示搜索/RAG 元数据）。**`POST /api/chat/stream` 请求体须带 `session_id`**（当前选中会话）。
- **已知实现缺口（v1.2 须闭环）**：登出再登入后须 **重新请求会话列表与各会话消息**，不得以空状态覆盖已持久化历史（与 PRD 5.9-B 一致）。

---

## 1. 技术选型与理由

| 组件 | 技术选型 | 理由 |
|------|----------|------|
| **核心框架** | **React 18** | 生态丰富、组件化开发、支持 Hooks 和函数式编程，与 Vercel AI SDK 深度集成。 |
| **构建工具** | **Vite** | 极速冷启动、HMR 热更新、开箱即用的 TypeScript 支持，适合现代前端项目。 |
| **编程语言** | **TypeScript** | 类型安全，减少运行时错误，提升代码可维护性，与后端共享类型定义。 |
| **UI 样式** | **Tailwind CSS** | 原子化 CSS，快速构建响应式界面，无需编写大量自定义 CSS，易于维护。 |
| **状态管理** | **Zustand** | 轻量级、无 Boilerplate，支持异步状态和中间件，适合中小型项目。 |
| **路由** | **React Router v6** | 功能完善、稳定，支持嵌套路由和路由守卫。 |
| **HTTP 客户端** | **Fetch API + 封装** | 原生支持，轻量；通过自定义 Hook 统一处理错误和加载状态。 |
| **对话流** | **Vercel AI SDK + 自定义 SSE 解析（按需）** | `useChat` 处理标准流；**自定义事件**（`tool_result_meta`、`citation`）需 `fetch`/`ReadableStream` 解析或扩展 transport（见 §5.3）。 |
| **文件上传** | **原生 XMLHttpRequest + react-dropzone** | 支持拖拽上传、分片上传进度监听，`react-dropzone` 提供友好拖拽区域组件。 |
| **Markdown 渲染** | **react-markdown + remark-gfm + rehype-highlight** | 支持 GFM 语法、代码高亮，满足 AI 回复的富文本需求。 |
| **通知系统** | **react-hot-toast + 浏览器 Notification API（可选）** | Toast 满足页面内提示；PRD 2.5.3 要求上传成功/失败可做 **系统通知**，在用户授权后调用 `Notification`。 |
| **表单处理** | **react-hook-form** | 高性能，支持表单验证，用于文件上传元数据弹窗、设置页偏好表单。 |
| **测试** | **Vitest + React Testing Library** | 快速、兼容 Vite，适合组件测试和单元测试。 |

---

## 2. 整体架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                          浏览器                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    应用容器 (App)                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ 路由模块    │  │ 状态管理    │  │   布局组件      │   │  │
│  │  │ React Router│  │  Zustand   │  │  (Header/侧边栏)│   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                   页面组件层                         │  │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │  │  │
│  │  │  │ 对话页面     │ │ 工作空间页面 │ │ 设置页面   │  │  │  │
│  │  │  │ (Chat)       │ │ (Files)      │ │ (Settings) │  │  │  │
│  │  │  │ 主区单列对话 │ │              │ │            │  │  │  │
│  │  │  │ + 侧栏会话列表│ │              │ │            │  │  │  │
│  │  │  └──────────────┘ └──────────────┘ └────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                   公共组件层                         │  │  │
│  │  │  Message / FileCard / UploadProgress / CitationUI   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Hooks：useChatStream │ useFiles │ useAuth │ useTasks │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  HTTP 客户端 +（可选）SSE 解析器                      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**架构特点**：

- **组件化**：页面、公共组件、业务组件分层，提高复用性。
- **状态与 UI 分离**：使用 Zustand 管理全局状态；**当前轮次的 `tool_result_meta` / `citation` 索引**可存于 UI Store 或消息关联 Map，供悬停组件读取。
- **Hooks 抽象**：将 API 调用、流式对话、上传状态机封装为自定义 Hooks。
- **类型安全**：与后端共享或手抄 `types/`（`User`、`Task`、`FileInfo`、`SseEvent` 等）。

---

## 3. 模块划分

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| **路由模块** | 页面路由定义、守卫、懒加载 | `frontend/src/router/index.tsx`, `frontend/src/router/guards.ts` |
| **全局状态管理** | 用户信息、**preferences**、AI 昵称、**当前 `sessionId`、会话列表摘要**、对话辅助态（搜索中/研究中） | `frontend/src/store/userStore.ts`, `frontend/src/store/chatSessionStore.ts`（或并入 uiStore）、`frontend/src/store/uiStore.ts` |
| **HTTP 客户端** | API 请求封装、拦截器、错误处理、**413 文件过大**、**4xx 业务错误**（如未来名称策略变更） | `frontend/src/api/client.ts` |
| **认证** | 匿名登录、`is_new_user`、可选名称预检 | `frontend/src/api/auth.ts`, `frontend/src/hooks/useAuthLogin.ts`（可选） |
| **会话** | 列表、创建、消息分页、重命名 | `frontend/src/api/sessions.ts`, `frontend/src/hooks/useSessions.ts` |
| **SSE / 对话流** | 解析 `token` + **`tool_result_meta`** + **`citation`** + `intention`；**随请求携带 `session_id`** | `frontend/src/lib/chat-stream.ts`, `frontend/src/hooks/useChatStream.ts` |
| **对话模块** | **中间单列对话区（参考 DeepSeek）**、底部输入；消息流、富文本与引用悬停 | `frontend/src/pages/Chat/`, `frontend/src/components/chat/` |
| **布局 / 会话列表** | 侧栏「对话」下 **可折叠** 会话列表；**右键菜单「修改名称」**、原位编辑 | `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/chat/SessionList.tsx`, `SessionRenameInline.tsx` |
| **任务模块** | 任务列表、**detail/子任务**展示（与对话互补） | `frontend/src/components/tasks/`, `frontend/src/hooks/useTasks.ts` |
| **文件管理模块** | 列表筛选、上传（小/大）、标签、路径、**processed** 展示 | `frontend/src/pages/Files/`, `frontend/src/hooks/useFiles.ts`, `frontend/src/hooks/useFileUpload.ts` |
| **用户设置模块** | 用户信息、**preferences**、AI 昵称 | `frontend/src/pages/Settings/` |
| **公共组件** | 消息气泡、文件卡片、进度条、模态框等 | `frontend/src/components/ui/` |

---

## 4. 数据存储设计

前端使用 **localStorage** 和 **IndexedDB** 进行本地缓存，提升性能和用户体验。**权威数据以后端为准**，本地仅加速与弱网展示。

### 4.1 本地存储结构

| 存储方式 | 键名 | 存储内容 | 说明 |
|----------|------|----------|------|
| localStorage | `user` | 用户 ID、姓名、**邮箱可空**、AI 昵称、**preferences（摘要）** | 与 `GET /api/user` 对齐；刷新后先展示缓存再异步拉取 |
| localStorage | `token` | 认证 Token | 由 **`POST /api/auth/login`** 写入；登出清除 |
| localStorage | `activeSessionId`（可选） | 上次选中会话 | 提升回访体验；**登录后须与 `GET /api/sessions` 校验** 仍存在 |
| IndexedDB | `files` | 文件列表（离线缓存） | 使用 `idb` 库；**需随 `folder_path`/tags 变化失效或分区键** |
| IndexedDB | `messages` | 最近对话消息（可选） | 断网展示；与 PRD「短期记忆以服务端为准」不冲突 |

### 4.2 缓存策略

- **用户信息**：首次登录后写入 localStorage；**`preferences` 更新后**同步写入并与服务端 PUT 一致。
- **文件列表**：拉取后写入 IndexedDB；网络断开时只读缓存并提示「离线」。
- **对话历史**：以**当前 `session_id`** 为键；进入会话或切换会话时 **`GET /api/sessions/:id/messages`** 拉取；**登录成功后必须先拉会话列表再渲染**，避免登出再登入后列表/消息为空（PRD v1.2 §5.9-B）。

---

## 5. API 通信设计

### 5.1 统一 HTTP 客户端

- **基地址**：一律使用 **`import.meta.env.VITE_API_BASE`** 拼接路径，**禁止**对 `useChat` 使用无前缀的 `'/api/chat/stream'`（除非 Vite `server.proxy` 将 `/api` 转到后端，且生产构建同样配置边缘路由）。

```typescript
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? '';

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options?.headers);
  headers.set('Authorization', `Bearer ${localStorage.getItem('token')}`);
  if (options?.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const err = new Error((errBody as { error?: string }).error || '请求失败') as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }
  return response.json() as Promise<T>;
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
```

### 5.2 API 接口封装（与后端 §5 对齐）

```typescript
// src/types/user.ts — User 含 preferences?: Record<string, unknown>；email?: string | null（PRD v1.2 可选邮箱）

// src/api/auth.ts
export const authAPI = {
  login: (body: { name: string; email?: string | null }) =>
    request<{ token: string; user: User; is_new_user: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** 可选：失焦预检名称是否已有账号（仅影响按钮文案，不登录） */
  profileExists: (name: string) =>
    request<{ exists: boolean }>(`/api/auth/profile-exists?name=${encodeURIComponent(name)}`),
};

// src/api/sessions.ts
import type { ChatMessage } from '../types/chat';
export type ChatSession = { id: string; title: string; created_at: number; updated_at: number };

export const sessionsAPI = {
  list: () => request<ChatSession[]>('/api/sessions'),
  create: () => request<ChatSession>('/api/sessions', { method: 'POST' }),
  messages: (sessionId: string, q?: { cursor?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (q?.cursor) p.set('cursor', q.cursor);
    if (q?.limit) p.set('limit', String(q.limit));
    const qs = p.toString();
    return request<ChatMessage[]>(`/api/sessions/${sessionId}/messages${qs ? `?${qs}` : ''}`); // ChatMessage：与 SSE/消息列表对齐
  },
  rename: (sessionId: string, title: string) =>
    request(`/api/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
};

// src/api/user.ts
export const userAPI = {
  getUser: () => request<User>('/api/user'),
  updateUser: (data: { name?: string; email?: string; preferences?: Record<string, unknown> }) =>
    request('/api/user', { method: 'PUT', body: JSON.stringify(data) }),
  setAiNickname: (nickname: string) =>
    request('/api/user/ai-name', { method: 'PUT', body: JSON.stringify({ nickname }) }),
};

// src/api/tasks.ts — Task 含 detail / detail_json（PRD 2.3-5）
export const tasksAPI = {
  list: (q?: { status?: string; projectId?: string | null }) => {
    const p = new URLSearchParams();
    if (q?.status) p.set('status', q.status);
    if (q?.projectId !== undefined && q?.projectId !== null) p.set('project_id', q.projectId);
    const qs = p.toString();
    return request<Task[]>(`/api/tasks${qs ? `?${qs}` : ''}`);
  },
  create: (task: { title: string; description?: string; detail?: unknown; status?: string }) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
  update: (id: string, updates: Partial<Task>) =>
    request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: string) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
};

/** initiate-multipart 响应；字段以后端 OpenAPI/实现为准 */
type InitMultipartResponse = {
  upload_id: string;
  r2_key: string;
  part_urls: string[];
};

// src/api/files.ts
export const filesAPI = {
  list: (q?: { folder?: string; type?: string }) => {
    const p = new URLSearchParams();
    if (q?.folder) p.set('folder', q.folder);
    if (q?.type) p.set('type', q.type);
    const qs = p.toString();
    return request<FileInfo[]>(`/api/workspace${qs ? `?${qs}` : ''}`);
  },
  /** 小文件（如 ≤5MB）：multipart/form-data，字段 file、semantic_type，可选 folder_path、tags（JSON 字符串） */
  uploadSmall: (form: FormData) =>
    request<{ id: string }>('/api/files/upload', { method: 'POST', body: form }),
  initiateMultipart: (body: {
    filename: string;
    original_name: string;
    mime_type: string;
    size: number;
    semantic_type: string;
    folder_path?: string;
    tags?: string[];
  }) => request<InitMultipartResponse>('/api/files/initiate-multipart', { method: 'POST', body: JSON.stringify(body) }),
  completeMultipart: (body: {
    upload_id: string;
    r2_key: string;
    parts: { etag: string; partNumber: number }[];
  }) => request<{ id: string; message?: string }>('/api/files/complete-multipart', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => request(`/api/files/${id}`, { method: 'DELETE' }),
  rename: (id: string, new_name: string) =>
    request(`/api/files/${id}/rename`, { method: 'PUT', body: JSON.stringify({ new_name }) }),
  updateSemanticType: (id: string, semantic_type: string) =>
    request(`/api/files/${id}/semantic-type`, { method: 'PUT', body: JSON.stringify({ semantic_type }) }),
  updateTags: (id: string, tags: string[]) =>
    request(`/api/files/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
  download: (id: string) => request<{ url: string }>(`/api/files/${id}/download`),
};
```

**`FileInfo` 关键字段（与后端一致）**：`id`, `original_name`, `mime_type`, `size`, `semantic_type`, **`folder_path`**, **`tags`**, **`processed`**（`0` | `1` | `-1`）, `created_at`。

### 5.3 流式对话（SSE）与 PRD 悬停元数据

后端除 `event: token` / `tool_call` / `done` 外，下发（参见后端 §5.1）：

| 事件 | 用途 |
|------|------|
| **`tool_result_meta`** | 搜索等工具的结构化摘要（标题、链接、snippet…），供 **ToolCallMark** 悬停，避免从纯文本猜 JSON |
| **`citation`** | RAG 命中：`file_id`、`filename`、`semantic_type`、`excerpt`、`score` 等，与正文 `<rag>` 联动 |
| **`intention`**（可选） | 驱动「正在搜索…」「深度研究中…」等 UI 状态 |

**实现策略**：

1. **首选**：自定义 `fetch(apiUrl('/api/chat/stream'), …)` 读取 `ReadableStream`，按 SSE 行解析，将 `token` 拼入 assistant 消息，将 `tool_result_meta`/`citation` 写入 **当前 assistant 消息的附属结构**（如 `message.data.citations[]`）或 Zustand `streamMetaByMessageId`。
2. **若沿用 `useChat`**：通过 **`experimental_transform`** 或官方文档支持的 **自定义 transport / data stream**（以当前 `ai` 包版本为准）；若默认不转发自定义事件，则采用 (1)。
3. **对话 URL**：`apiUrl('/api/chat/stream')`，**不得**依赖相对路径 `/api/...` 指向前端 origin。请求 JSON 须包含 **`session_id`**（与后端 §5.1 一致）。

---

## 6. UI 组件设计

### 6.1 组件目录结构（约定）

以下为 v1.2 **推荐的完整** `components/` 布局；树状路径以 **`frontend/` 为前端工程根**（与仓库根目录下 `backend/` 并列），与 §3 模块划分及开发任务中的组件命名一致。实现时可将复杂组件拆分为同目录下的 `*.types.ts` / `useXxx.ts` 等，但**职责边界**（对话 / 任务 / 文件 / 布局 / 通用 UI）建议保持与本树一致。更外层 `pages/`、`hooks/`、`api/` 等见 **§13**。

```
frontend/src/components/
├── layout/                    # 全局壳层：与架构图中 Header / 侧边栏对应
│   ├── AppShell.tsx           # Outlet + 公共布局槽位
│   ├── Header.tsx
│   └── Sidebar.tsx            # 导航：Chat（下挂可折叠会话列表）/ Files / Settings
├── auth/
│   └── RequireAuth.tsx        # 与 §8.3 路由守卫配合（未登录跳转 /login）
├── chat/                      # 对话页专用（对应 frontend/src/pages/Chat/）
│   ├── SessionList.tsx        # 可折叠区内的会话列表；与 Sidebar 协同
│   ├── SessionListItem.tsx    # 单行：标题、时间；onContextMenu →「修改名称」
│   ├── SessionRenameInline.tsx # 原位 input + 失焦/回车 → PATCH
│   ├── Message.tsx            # Markdown、<rag>/<tool> 与 SSE 元数据关联
│   ├── MessageList.tsx        # 可选：配合 react-window / react-virtual
│   ├── ChatInput.tsx          # 多行输入、发送/中止流式请求（附带当前 session_id）
│   ├── ToolCallMark.tsx       # 搜索等：绑定 tool_result_meta
│   ├── RagCitation.tsx        # RAG：绑定 citation + 正文 <rag>
│   └── ChatStatusIndicator.tsx # 「正在搜索…」「深度研究中…」等（intention / 工具起止）
├── tasks/                     # 任务侧栏与详情（与 useTasks、tasksAPI 配合）
│   ├── TaskSidebar.tsx        # 列表、筛选、快捷插入
│   ├── TaskItem.tsx
│   └── TaskDetailPanel.tsx    # 展开任务 detail / 子任务信息
├── files/                     # 工作空间（对应 frontend/src/pages/Files/）
│   ├── FileList.tsx           # 列表/网格、排序与筛选入口
│   ├── FileCard.tsx           # tags、folder_path、processed（0/1/-1）
│   ├── FolderBreadcrumb.tsx   # 与 GET ?folder= 前缀一致（可选）
│   ├── FileToolbar.tsx        # 搜索框、类型筛选、视图切换（可与 FileList 合并）
│   ├── UploadDropzone.tsx     # react-dropzone 封装
│   ├── UploadProgress.tsx     # 虚线/实线/红框、分片总进度
│   └── SemanticTypeModal.tsx  # react-hook-form：语义类型、folder_path、tags
└── ui/                        # 与设计系统无关的通用块（非业务）
    ├── Button.tsx
    ├── Modal.tsx
    ├── Spinner.tsx
    └── …                      # Input、Select、Toast 容器等按需补充
```

### 6.2 核心组件设计

#### 6.2.1 消息组件（Message）

- 支持 Markdown、代码块；链接可点击（PRD 5.4）。
- 解析 `<rag>` / `<tool>`；**优先用 SSE `citation` / `tool_result_meta` 与段落位置关联**，悬停展示完整元数据（PRD 2.1-4、5.6）。

#### 6.2.2 工具调用标记（ToolCallMark）

- 展示「搜索」等状态；悬浮层数据来自 **`tool_result_meta`**（若无事件则降级解析正文/工具返回）。

#### 6.2.3 文件卡片（FileCard）

- 文件名、大小、上传时间、**语义类型**、**tags**（如 important）、**folder_path**（或面包屑当前前缀）。
- **`processed`**：`0` 处理中、`1` 已索引、`-1` 失败（提示重试或仅下载）。
- 操作：重命名、删除、下载、改语义类型、**编辑 tags（PUT /tags）**。

#### 6.2.4 上传流程（PRD 2.5.2 / 2.5.3）

- **选择文件后**：校验 **`file.size <= 64 * 1024 * 1024`**，否则 toast 提示并中止（PRD 约束）。
- **弹窗**：必填语义类型；可选 **folder_path**、初始 **tags**。
- **小文件**：`FormData` → `POST /api/files/upload`；**大文件**：`initiate-multipart` → XHR 分片 PUT 预签名 URL → **`complete-multipart` 携带 `upload_id`、`r2_key`、`parts`**（与后端一致）。
- **成功/失败**：虚线/实线/红框、进度条；**toast + 可选 `Notification`**（用户授权后）。

#### 6.2.5 对话进行中状态（PRD 2.6 / 5.5 / 5.6）

- 根据 **`intention`** 或工具调用开始/结束：展示 **「正在搜索…」「正在整理研究结果…」** 等，避免长时间无反馈。
- 后端返回 **Serper 软限/降级** 文案时，在气泡或 toast 中原文友好展示（PRD 2.6.2-6）。

#### 6.2.6 主对话区与侧栏会话（PRD v1.2 §2.1、§2.9）

- **布局**：中间主栏仅保留 **单列消息流 + 底部输入**，视觉权重参考 [DeepSeek Chat](https://chat.deepseek.com/)（宽屏居中、留白与层次清晰）；任务/文件入口仍在侧栏或顶栏，**不把任务列表挤占主对话区**。
- **侧栏**：「对话」菜单项下为 **可折叠面板**，内嵌 `SessionList`；展开时展示按 `updated_at` 排序的会话行，**当前 `sessionId` 高亮**。
- **切换**：点击会话 → `setSessionId` → `GET .../messages` 填充 `MessageList`；发送新消息时 `useChatStream` 使用同一 `session_id`。
- **新会话**：提供「新对话」入口 → `POST /api/sessions` 后选中新 `id`。
- **右键重命名**：`SessionListItem` 上 `onContextMenu` 弹出菜单（浏览器原生或自定义），选「修改名称」→ 行内切换为 `SessionRenameInline`，`PATCH` 成功后更新 Store 与列表。
- **自动标题**：列表标题以后端写入的 `chat_sessions.title` 为准；流式结束后可 `sessionsAPI.list()` 刷新或依赖推送（若后端后续增加 SSE `session_title` 再扩展）。

#### 6.2.7 登录／落地页（PRD v1.2 §2.2、§3.2）

- **表单**：**名称**（必填）、**邮箱**（选填）；提交调用 `authAPI.login`。
- **按钮**：提交后根据 **`is_new_user`** 区分成功反馈；**提交前**可调用 **`authAPI.profileExists`** 在失焦时预切换主按钮文案（`exists: false` →「开始吧」，`exists: true` →「欢迎回来」）。
- **错误**：v1.2 下 **同名即登录**，一般不出现「名称被占用」错误；若接口返回 4xx，统一 toast 展示服务端文案。
- **视觉**：背景可用 **深色渐变、微粒/网格动效、柔和光晕** 等（控制性能与可访问性对比度），体现 **AI / 未来感**，与 PRD §3.2 一致；避免干扰表单可读性。

---

## 7. 状态管理（Zustand）

### 7.1 Store 结构

```typescript
// src/store/userStore.ts
interface UserState {
  user: User | null; // 含 preferences?: Record<string, unknown>
  aiNickname: string;
  setUser: (user: User) => void;
  setAiNickname: (nickname: string) => void;
  setPreferences: (p: Record<string, unknown>) => void;
  clearUser: () => void;
}

// src/store/uiStore.ts（示例）
interface UiState {
  chatStatus: 'idle' | 'thinking' | 'searching' | 'researching';
  setChatStatus: (s: UiState['chatStatus']) => void;
}
```

### 7.2 与 API 联动

`fetchUser` 将 **`preferences`** 一并写入 Store；设置页修改后 `PUT /api/user` 并更新本地缓存。

---

## 8. 路由设计

### 8.1 路由表

| 路径 | 页面组件 | 权限 | 说明 |
|------|----------|------|------|
| `/` | `Chat` | 需登录 | 对话首页 |
| `/files` | `FileWorkspace` | 需登录 | 个人工作空间 |
| `/settings` | `Settings` | 需登录 | 用户、**偏好**、AI 昵称 |
| `/login` | `Login` | 未登录可访问 | **匿名昵称登录**（名称必填、邮箱选填、`authAPI.login`）；**科技感落地视觉**（§6.2.7） |

### 8.2 新用户与 PRD「首轮对话补全资料」

- **技术上前端仍需身份**：`POST /api/auth/login` 签发 JWT；**邮箱可空**。
- **产品行为**：用户进入某 **会话** 并发送首条消息后，若资料不全，由 **AI 在同一条首条助手回复中** 并列询问缺失项（PRD v1.2 §2.2-4）；**设置页**仍可补充邮箱。Chat 页 **不因缺邮箱阻塞进线**。
- **会话维度**：`session_id` 由登录后 `GET/POST /api/sessions` 获得；**不得**在未拉取历史时假定消息数组为空即「无历史」（再登录场景须重新拉取，见 §4.2）。

### 8.3 路由守卫

同前：`RequireAuth` 基于 `user` 或 `token` 跳转 `/login`。

---

## 9. 性能优化

| 优化项 | 策略 |
|--------|------|
| **代码分割** | `React.lazy` + `Suspense` 分割 Chat / Files / Settings |
| **虚拟滚动** | 长消息列表可选 `react-window` / `react-virtual` |
| **防抖** | 工作空间文件名搜索、`folder` 切换节流 |
| **缓存** | 文件列表 IndexedDB；**按 folder 前缀或查询串分 key** |

---

## 10. 异常处理与用户体验

| 场景 | 处理方式 |
|------|----------|
| **网络断开** | 全局提示；对话输入可禁用；文件列表展示缓存 |
| **API 错误** | Toast；**413** 明确提示「单文件不超过 64MB」 |
| **上传失败** | 红框节点、原因文案、重试/删除（PRD 2.5.3） |
| **搜索限流/降级** | 展示后端返回文案；不阻断其它对话能力（PRD 3.5.3） |
| **对话流中断** | 有限自动重试 + 手动重发 |
| **长时研究** | 「研究中」态 + 超时提示（PRD 3.1） |

---

## 11. 文件上传进度反馈实现

### 11.1 策略选择

| 条件 | 行为 |
|------|------|
| `file.size <= 5MB`（与后端约定一致） | `multipart/form-data` → `POST /api/files/upload`；XHR `upload.onprogress` |
| 更大且 `<= 64MB` | `initiate-multipart` → 分片 XHR → `complete-multipart`（**body 含 `r2_key`**，来自 initiate 响应） |

### 11.2 分片流程要点

1. `initiate-multipart` 返回 **`upload_id`、`r2_key`、`part_urls`**（以后端字段名为准）。
2. 每片 `PUT part_urls[i]`，`ETag` 与 `partNumber` 写入 `parts`。
3. `complete-multipart`：`{ upload_id, r2_key, parts: [{ etag, partNumber }] }`。

### 11.3 进度与 UI

- 占位虚线节点、总进度 = 已上传字节 / `file.size`。
- 失败：分片级重试或整单重试（PRD 3.5.4 鲁棒性）。

---

## 12. 部署与构建

- **工程目录**：在 monorepo 中进入 **`frontend/`** 再执行安装与构建（与 **`backend/`** 互不混淆）。
- **环境变量**：`VITE_API_BASE`（生产为 Worker/Pages 暴露的 **HTTPS 根 URL**，无尾部斜杠）。
- **CORS**：由后端配置；前端仅请求该基地址。
- 部署：**Cloudflare Pages** / **Vercel**；在 `frontend/` 下执行 `npm run build`（或将构建根目录指向 `frontend/`）。

---

## 13. 完整源码目录结构（约定）

下列为与本文 **§1～§12**、**§3 模块表** 及 [tasks_frontend_v1_2.md](../tasks/tasks_frontend_v1_2.md) 对齐的 **完整前端工程骨架**（Vite + React + TS）。**`frontend/`** 与仓库根目录下的 **`backend/`** 并列；`frontend/src/components/` 的细目见 **§6.1**。`frontend/` 包根上的配置文件（`package.json`、`vite.config.ts`、`tailwind.config.js`、`postcss.config.js`、`tsconfig.json`、`index.html`、`.env.example` 等）按脚手架惯例放置，此处不逐一枚举。

```
<repository-root>/
├── backend/                   # 后端工程（Worker 等），参见 backend 目录内文档
└── frontend/                  # 前端工程根：npm 安装、dev、build 均在此目录执行
    ├── package.json
    ├── index.html
    ├── public/                # 静态资源（favicon 等）
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx            # 路由出口、全局 Provider（如 Toaster）
    │   ├── vite-env.d.ts
    │   ├── styles/
    │   │   └── index.css      # Tailwind 入口
    │   ├── router/
    │   │   ├── index.tsx      # 路由表：/、/files、/settings、/login
    │   │   └── guards.ts      # RequireAuth 等逻辑（可与 components/auth 复用）
    │   ├── pages/
    │   │   ├── Chat/
    │   │   │   └── index.tsx  # 主区单列对话 + sessionId 驱动拉取历史
    │   │   ├── Files/
    │   │   │   └── FileWorkspace.tsx
    │   │   ├── Settings/
    │   │   │   └── index.tsx
    │   │   └── Login/
    │   │       └── index.tsx
    │   ├── components/        # 见 §6.1 完整树
    │   ├── hooks/
    │   │   ├── useChatStream.ts
    │   │   ├── useSessions.ts
    │   │   ├── useTasks.ts
    │   │   ├── useFiles.ts
    │   │   └── useFileUpload.ts
    │   ├── api/
    │   │   ├── client.ts      # request、apiUrl、413/401 及通用 4xx 处理
    │   │   ├── auth.ts
    │   │   ├── sessions.ts
    │   │   ├── user.ts
    │   │   ├── tasks.ts
    │   │   └── files.ts
    │   ├── store/
    │   │   ├── userStore.ts
    │   │   ├── chatSessionStore.ts  # 可选：sessions、activeSessionId
    │   │   └── uiStore.ts
    │   ├── lib/
    │   │   ├── chat-stream.ts # SSE 解析、事件归并到消息或 Store
    │   │   ├── idb.ts         # 可选：IndexedDB 封装（文件列表缓存）
    │   │   └── utils.ts       # 格式化、防抖节流等
    │   └── types/
    │       ├── user.ts
    │       ├── task.ts
    │       ├── file.ts
    │       ├── chat.ts
    │       └── sse.ts         # SseEvent、ToolResultMeta、CitationPayload 等
    ├── e2e/                   # Playwright 规格（与 §14 E2E 一致；操作说明见 docs/testing/frontend_e2e_and_build.md）
    └── …                      # vitest.config、eslint 等
```

**测试文件放置**：与 §14 一致，可采用**与源文件同目录**的 `*.test.ts(x)`，或集中 `frontend/src/__tests__/`；Vitest `setup` 可放在 `frontend/src/test/setup.ts`（任选其一，团队内统一即可）。

---

## 14. 测试策略

| 测试类型 | 工具 | 覆盖范围 |
|----------|------|----------|
| **单元测试** | Vitest | SSE 解析、上传状态机、64MB 校验 |
| **组件测试** | RTL | Message + Citation、FileCard processed 态 |
| **E2E** | Playwright | 匿名登录（新/回访）、会话切换与历史、右键重命名、对话流、分片上传、tags、设置 preferences |

**E2E 与生产构建验收的可复现步骤**（环境变量、前后端启动顺序、规格文件说明、CI 建议、排错）：见仓库 **[`docs/testing/frontend_e2e_and_build.md`](../testing/frontend_e2e_and_build.md)**。

---

## 15. 总结

本方案以 **React + TypeScript + Vite + Tailwind** 实现 **PRD v1.2** 对话布局（DeepSeek 式主区 + 可折叠会话列表）、匿名登录与 **session 维度历史**；**流式层、§5.0/5.1.1 会话 API、文件 API** 与后端 `tech_design_ai_bot_v1_2.md` 对齐，**SSE 扩展事件**满足搜索/RAG 悬停展示。实现时若后端字段或事件有变更，应**以仓库内后端设计为单一事实来源**并同步调整前端类型与 Hook。

---

**文档结束**
