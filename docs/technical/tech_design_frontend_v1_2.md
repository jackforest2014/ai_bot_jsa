# 前端技术设计方案（v1.2，对齐 PRD v1.1）

## 文档版本

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-21 | AI Assistant | 初稿完成 |
| 1.2 | 2026-03-21 | AI Assistant | 对齐 [PRD v1.1](../products/ai_bot_v1_1.md) 与后端 [tech_design_ai_bot_v1_2.md](./tech_design_ai_bot_v1_2.md)（§5.x）：SSE `tool_result_meta`/`citation`、`preferences`、任务 `detail`、文件 `folder_path`/`tags`/`processed`、完整 files API、小文件/分片双路径、64MB 校验、浏览器通知、搜索/研究态与配额提示、登录与 AI 引导关系说明 |

### 与 PRD / 后端的范围说明

- **以后端契约为准**：接口路径、请求体字段、SSE 事件名以 `tech_design_ai_bot_v1_2.md` 为准；若后端变更，前端类型与 Hook 应同步更新。
- **PRD 2.5.1 文件夹**：v1.1 可采用 **逻辑路径 `folder_path` + `GET ?folder=`**（与后端一致），完整「创建文件夹」树形 UI 可作为后续迭代。
- **流式对话**：除正文 token 外，须消费 **`tool_result_meta`、`citation`（及可选 `intention`）** 以满足 PRD 2.1-4、5.6（悬停展示搜索/RAG 元数据）。

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
│  │  │  │ (Chat)      │ │ (Files)      │ │ (Settings) │  │  │  │
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
| **路由模块** | 页面路由定义、守卫、懒加载 | `src/router/index.tsx`, `src/router/guards.ts` |
| **全局状态管理** | 用户信息、**preferences**、AI 昵称、对话辅助态（搜索中/研究中） | `src/store/userStore.ts`, `src/store/uiStore.ts` |
| **HTTP 客户端** | API 请求封装、拦截器、错误处理、**413 文件过大** | `src/api/client.ts` |
| **SSE / 对话流** | 解析 `token` + **`tool_result_meta`** + **`citation`** + `intention` | `src/lib/chat-stream.ts`, `src/hooks/useChatStream.ts` |
| **对话模块** | 对话界面、消息流、富文本与引用悬停 | `src/pages/Chat/`, `src/components/chat/` |
| **任务模块** | 任务列表、**detail/子任务**展示（与对话互补） | `src/components/tasks/`, `src/hooks/useTasks.ts` |
| **文件管理模块** | 列表筛选、上传（小/大）、标签、路径、**processed** 展示 | `src/pages/Files/`, `src/hooks/useFiles.ts`, `useFileUpload.ts` |
| **用户设置模块** | 用户信息、**preferences**、AI 昵称 | `src/pages/Settings/` |
| **公共组件** | 消息气泡、文件卡片、进度条、模态框等 | `src/components/ui/` |

---

## 4. 数据存储设计

前端使用 **localStorage** 和 **IndexedDB** 进行本地缓存，提升性能和用户体验。**权威数据以后端为准**，本地仅加速与弱网展示。

### 4.1 本地存储结构

| 存储方式 | 键名 | 存储内容 | 说明 |
|----------|------|----------|------|
| localStorage | `user` | 用户 ID、姓名、邮箱、AI 昵称、**preferences（摘要）** | 与 `GET /api/user` 对齐；刷新后先展示缓存再异步拉取 |
| localStorage | `token` | 认证 Token | 保持登录状态 |
| IndexedDB | `files` | 文件列表（离线缓存） | 使用 `idb` 库；**需随 `folder_path`/tags 变化失效或分区键** |
| IndexedDB | `messages` | 最近对话消息（可选） | 断网展示；与 PRD「短期记忆以服务端为准」不冲突 |

### 4.2 缓存策略

- **用户信息**：首次登录后写入 localStorage；**`preferences` 更新后**同步写入并与服务端 PUT 一致。
- **文件列表**：拉取后写入 IndexedDB；网络断开时只读缓存并提示「离线」。
- **对话历史**：当前会话以内存 + 流式状态为主；刷新后依赖后端会话恢复能力（PRD 约束与假设 §4）。

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
// src/types/user.ts — User 含 preferences?: Record<string, unknown>

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
    return request<FileInfo[]>(`/api/files${qs ? `?${qs}` : ''}`);
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
3. **对话 URL**：`apiUrl('/api/chat/stream')`，**不得**依赖相对路径 `/api/...` 指向前端 origin。

---

## 6. UI 组件设计

### 6.1 组件目录结构（增量）

```
src/components/
├── chat/
│   ├── Message.tsx
│   ├── MessageList.tsx
│   ├── ChatInput.tsx
│   ├── ToolCallMark.tsx      # 搜索等：绑定 tool_result_meta
│   └── RagCitation.tsx       # RAG：绑定 citation + 正文 <rag>
├── files/
│   ├── FileCard.tsx          # 展示 tags、folder_path、processed 状态
│   ├── FolderBreadcrumb.tsx # 可选：与 ?folder= 前缀一致
│   ...
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
| `/login` | `Login` | 未登录可访问 | 账号/令牌；**与 PRD 2.2 的关系见下** |

### 8.2 新用户与 PRD「AI 主动询问姓名邮箱」

- **技术上前端仍需身份**（Token / 会话），`/login` 或等价流程负责建立身份。
- **产品行为**：用户进入对话后，若后端/对话判定资料不全，由 **AI 在 Chat 内引导补全**（与 PRD一致）；**设置页**可作为补充入口。技术文档要求 Chat 页支持 **空资料态**（不阻塞进线，由 AI 发起询问）。

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

- **环境变量**：`VITE_API_BASE`（生产为 Worker/Pages 暴露的 **HTTPS 根 URL**，无尾部斜杠）。
- **CORS**：由后端配置；前端仅请求该基地址。
- 部署：**Cloudflare Pages** / **Vercel**；构建 `npm run build`。

---

## 13. 目录结构（增量）

在初版目录基础上增加例如：

```
src/
├── lib/
│   └── chat-stream.ts       # SSE 解析、事件类型定义
├── types/
│   ├── sse.ts               # SseEvent / ToolResultMeta / CitationPayload
│   └── ...
```

---

## 14. 测试策略

| 测试类型 | 工具 | 覆盖范围 |
|----------|------|----------|
| **单元测试** | Vitest | SSE 解析、上传状态机、64MB 校验 |
| **组件测试** | RTL | Message + Citation、FileCard processed 态 |
| **E2E** | Playwright | 对话、分片上传、tags、设置 preferences |

---

## 15. 总结

本方案以 **React + TypeScript + Vite + Tailwind** 实现 PRD v1.1 所需对话、工作空间、任务与个性化能力；**流式层与文件 API 与后端 `tech_design_ai_bot_v1_2.md` §5 对齐**，通过 **SSE 扩展事件**满足搜索/RAG 悬停展示。实现时若后端字段或事件有变更，应**以仓库内后端设计与 OpenAPI（若有）为单一事实来源**并同步调整前端类型与 Hook。

---

**文档结束**
