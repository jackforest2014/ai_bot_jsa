# 技术实现方案：AI 专属助理与代理交互 (AI Proxy Demo)

## 目录
- [1. 概览](#1-概览)
- [2. 数据库设计 (Drizzle D1 Schema 更新)](#2-数据库设计-drizzle-d1-schema-更新)
  - [2.1 `users` 表](#21-users-表)
  - [2.2 `chat_sessions` 表（核心重构）](#22-chat_sessions-表核心重构)
  - [2.3 `tasks` 表](#23-tasks-表)
- [3. 核心 API 路由设计](#3-核心-api-路由设计)
  - [3.1 代理管理与初始化](#31-代理管理与初始化)
  - [3.2 代理会话创建 (`POST /api/chat/session`)](#32-代理会话创建-post-apichatsession)
- [4. Agent 核心执行链路隔离 (ChatService 改造)](#4-agent-核心执行链路隔离-chatservice-改造)
  - [4.1 动态系统提示词获取 (System Prompt Injection)](#41-动态系统提示词获取-system-prompt-injection)
  - [4.2 记忆与向量库检索隔离 (RAG Content Barrier)](#42-记忆与向量库检索隔离-rag-content-barrier)
  - [4.3 工具沙盒与权限裁剪 (ToolRegistry Sandbox)](#43-工具沙盒与权限裁剪-toolregistry-sandbox)
- [5. 前端（UI）改动关键点](#5-前端ui改动关键点)

---

## 1. 概览
为实现产品需求 `ai_proxy_demo.md` 中定义的“AI数字分身/专属助理”功能，本技术方案评估了现有基于 Cloudflare Workers + Hono + D1 + Qdrant 的系统架构。
整体架构设计的核心在于通过低侵入式的数据表字段扩充，实现权限和功能的隔离。尤其是在核心的“双边会话所有权”逻辑上，方案将 `chat_sessions` 表作为主载体，优雅解决访客记录与主人查阅之间的物理屏障问题。

---

## 2. 数据库设计 (Drizzle D1 Schema 更新)

通过新的迁移脚本（如 `0013_add_proxy_features.sql`）对三个核心表进行 `ALTER TABLE` 字段扩充：

### 2.1 `users` 表
- **变更需求**：支持存储随机生成的 UUID 代理标识。
- **字段扩充**：新增 `proxy_uuid: text('proxy_uuid').unique()` 
- **逻辑**：仅在用户首次成功上传人设文件时生成。

### 2.2 `chat_sessions` 表（核心重构）
*(注：项目原有的 `conversations` 表实际上是 Message 集合，管理状态流转的核心容器是 `chat_sessions`)*
- **变更需求**：实现双端视角归属与权限分类。
- **字段扩充**：新增 `proxy_for_user_id: text('proxy_for_user_id').references(() => users.id, { onDelete: 'set null' })`
- **逻辑**：
  - 访客（User B）作为发起人，其 ID 将写入原有的 `user_id` 字段（如果是匿名用户，则依据系统当前的匿名账户策略生成默认 user_id）。这样确保访客能够在自己设备侧查阅历史记录。
  - 主人（User A）的 ID 被写入 `proxy_for_user_id`。
  - **主人收件箱查询**：获取属于我的线索记录，SQL 条件为 `WHERE proxy_for_user_id = 'A_ID'`。

### 2.3 `tasks` 表
- **变更需求**：任务需要携带起源链路，以便 User A 追溯线索所在的聊天上下文。
- **字段扩充**：新增 `session_id: text('session_id').references(() => chatSessions.id, { onDelete: 'set null' })`
- **逻辑**：当 AI 判定满足转交条件，通过工具调用创建任务时，后台服务必须强制将当前的 `session_id` 填入该字段。

---

## 3. 核心 API 路由设计

### 3.1 代理管理与初始化
- **`POST /api/settings/proxy/upload`**
  - **功能**：User A 上传 Markdown 人设文件。
  - **实现细节**：复用现行的 R2 与 `fileUploads` 表上传逻辑。但后端强行重写（Override）元数据 `folder_path = 'persona'` 或 `人设`。上传成功后自动生成大写字母加数字拼合的 8 位 `proxy_uuid` 并更新 `users` 表，返回生成的公网链接。
- **`GET /api/proxy/:uuid/info`**
  - **功能**：访客通过公网链接进入时，验证 UUID，返回对应 User A 的脱敏公开名片（如昵称）以供前端渲染专属聊天室标题。

### 3.2 代理会话创建 (`POST /api/chat/session`)
- 前端建立新会话时，需要在 Payload 中携带 `proxy_uuid` 标记。
- 后端捕获该参数，通过 UUID 解读出真实宿主 User A，并在创建 `chat_sessions` 时将 UserA 的 ID 写入 `proxy_for_user_id`。

---

## 4. Agent 核心执行链路隔离 (ChatService 改造)

为了保证 User A 的绝对数据安全（防越界检索）以及访客交互边界，原有的 `ChatService` / `PlannerService` 需要进行以下机制沙盒化：

### 4.1 动态系统提示词获取 (System Prompt Injection)
当 `ChatService.handleMessage` 探测到当前 Session 带有 `proxy_for_user_id` 时：
1. 先根据 `proxy_for_user_id` 查询他名下 `folder_path = '人设'` 的最新文件。
2. 从 R2 对象存储或当前内存中读取该 Markdown 的纯文本，完整包裹后加载为 `system_instruction`，取代原有默认的“你是一个私人效率助手”基调。

### 4.2 记忆与向量库检索隔离 (RAG Content Barrier)
- 在执行历史对话汇总以及调用 `vector.retrieve()` 检索相似上下文时，必须加入强限制：
   - 过滤条件必须剥离宿主的其他文件（`folder_path != '人设'`）。即使访客提问诱导尝试探听主人的私人项目、薪水、隐私工作区文档，系统底层强制过滤也无法返回相关 chunk，从而避免隐私通过侧信道（Side Channel）被暴露。

### 4.3 工具沙盒与权限裁剪 (ToolRegistry Sandbox)
- **工具屏蔽**：针对 `proxy_for_user_id` 会话，AI 推理循环可调用的工具应被大范围裁剪。比如禁用 `update_task`, `delete_file`, `update_preferences_json` 等高权限危险工具。
- **代客录入工具 (CreateTaskTool)**：保留或新建一个专门响应访客线索的 `CreateTaskTool`。该工具执行回调中，提取工具参数 `$title`, `$description$，且在写入 D1 时，结合后端当前执行的 Context，强制把 `session_id` 值写入任务记录，不能让 LLM 自己决定这些关键维度的指派。

---

## 5. 前端（UI）改动关键点
1. **设置页**：增加“代理分身管理”栏目，展示“上传人设文件”按钮，以及只读的 Copy 代理链接组件。
2. **主人界面侧边栏**：新开功能入口“访客收件箱”，这里渲染的数据调用的是包含 `proxy_for_user_id` 匹配逻辑的接口。
3. **访客聊天室界面**：访客携带特定的 `/:uuid` 路由进入时，屏蔽掉“工作空间上传”、“复杂设置”等不属于访客状态的常规按钮，呈现出干净对外的“咨询模式” UI。从通知列表中展示线索相关卡片支持“查看对话现场”跳转按钮（依赖下发的 session_id）。
