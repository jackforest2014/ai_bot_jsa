# 问题与处理记录

本文档汇总开发与试用过程中出现过的问题、排查思路及对应修复（含相关代码位置）。随新问题补充可继续追加章节。

## 目录

- [1. 历史消息在重新登录后时间顺序错乱](#1-历史消息在重新登录后时间顺序错乱)
- [2. 登录后主界面科幻风格与代码高亮](#2-登录后主界面科幻风格与代码高亮)
- [3. 终端 typecheck 显示已取消，是否未执行](#3-终端-typecheck-显示已取消是否未执行)
- [4. 已有对话的账号登录后无历史、任务侧栏提示需登录](#4-已有对话的账号登录后无历史任务侧栏提示需登录)
- [5. 显示名称大小写（Jack / jack）与多账号](#5-显示名称大小写jack--jack与多账号)

---

## 1. 历史消息在重新登录后时间顺序错乱

### 现象

同一会话内消息本应交替为 `user → assistant → user → …`，重新登录拉取历史后顺序变成例如 `assistant → user → user → assistant` 等错乱形态。

### 原因

- 后端在同一轮对话中为用户消息与助手消息写入了**相同的 `created_at`**（同为 Unix 秒级时间戳）。
- 列表接口按 `(created_at, id)` 排序时，**`id` 为 UUID**，字典序**不代表时间先后**，同秒记录之间的次序不稳定。

### 排查

- 核对 `conversations` 表插入逻辑与列表 API 的 `orderBy` 字段。
- 确认是否存在「同 `created_at` 依赖 `id` 次序」的隐含假设。

### 解决

- **后端**：在写入前查询该会话当前最大 `created_at`，使用 `userAt = max(wallSec, maxAt + 1)`、`assistantAt = userAt + 1`，保证同一轮内两条记录时间戳严格递增。  
  - 涉及：`backend/src/db/repositories/conversation-repository.ts`（`maxCreatedAtForSession`）、`backend/src/chat/chat-service.ts`。
- **前端**：对 API 返回的消息列表做稳定排序：`created_at` 升序，同时间再按角色次序（`user` &lt; `assistant` &lt; `tool` &lt; `system`），最后按 `id`。  
  - 涉及：`frontend/src/lib/chat-message-order.ts`、`frontend/src/api/sessions.ts`、`frontend/src/lib/chat-message-order.test.ts`。

---

## 2. 登录后主界面科幻风格与代码高亮

### 现象 / 需求

- 登录页希望更有科幻感，可增加**动态变换的线框几何体**（以 Canvas 实现，未引入 Three.js）。
- 进入主应用后整体风格与登录页一致（科幻 / 后现代），但**主界面不需要**动态 3D 几何体。

### 排查

- 区分「仅登录页」与「AppShell 内路由」的组件边界，避免把重动画挂在全局布局上。

### 解决

- **登录页**：新增 `MorphingWireframeCanvas`（线框旋转 + 顶点呼吸等），并入登录页布局。  
  - 涉及：`frontend/src/components/login/MorphingWireframeCanvas.tsx`、`frontend/src/pages/Login/index.tsx`。
- **主壳与聊天区**：`AppShell`、`Header`、`Sidebar` 使用深色渐变、细网格、青色强调；对话区 `Chat`、`Message`、`ChatInput`、会话列表、任务侧栏、`RagCitation` / `ToolCallMark`、设置页等与深色主题对齐。
- **代码高亮**：助手气泡内 Markdown 代码块使用深色主题样式（由 `highlight.js` 的 `night-owl` 等主题提供）。  
  - 涉及：`frontend/src/components/chat/Message.tsx`（样式 import 与 markdown 组件颜色）。

---

## 3. 终端 typecheck 显示已取消，是否未执行

### 现象

在 IDE 或集成终端中运行 `npm run typecheck`（或同类命令）时，界面显示任务 **aborted / 已取消**，担心改动未真正通过检查。

### 原因

- 多为**终端会话被中断或超时**，与磁盘上的代码是否已保存、是否已通过编译**无必然联系**。

### 排查

- 在仓库内重新执行：`backend` 下 `npm run typecheck` 或 `npx tsc --noEmit`；`frontend` 下 `npm run build`。
- 查看退出码是否为 `0` 及是否输出具体 TS 错误。

### 解决

- **以本地重新跑完的命令结果为准**；若 exit code 为 0 且无报错，即视为通过。
- 若需 CI 保障，在流水线中固定执行上述脚本。

---

## 4. 已有对话的账号登录后无历史、任务侧栏提示需登录

### 现象

使用曾经聊过天的账号（如 Jack）登录后：**侧栏没有历史会话**（或长期空白），右侧任务栏显示「登录后可管理任务侧栏」；整体像未登录，但路由仍可能在受保护页内。

### 原因（根因组合）

1. **`localStorage.user` 被错误清空**  
   - 登录返回的 `token` 为 **JWT**（含 `.`），`user.id` 为 **UUID**，二者永远不相等。  
   - 若 `userStore` 在初始化时用 `user.id !== token` 判定不一致即删除缓存用户，则**每次刷新**都会丢掉本地用户摘要，导致 `user` 长期为 `null`。
2. **会话 bootstrap 与侧栏展示被 `profileHydrated` 门闩卡住**  
   - 仅在「`/api/user` 已成功」后才 `bootstrap()` 或显示会话区域时，会出现：有合法 Bearer、但资料请求慢/失败/竞态时，**会话列表永远不拉取**，任务区也因「无 user」被禁用。

### 排查

- 浏览器开发者工具：**Application → Local Storage**：是否存在 `token`、是否仍有 `user` JSON。
- **Network**：刷新后 `GET /api/user`、`GET /api/sessions` 是否 200、是否带 `Authorization: Bearer …`。
- 对照 `userStore` 初始化逻辑：JWT 下是否误清 `user`；`AppShell` 中 `bootstrap` 是否依赖 `profileHydrated`。

### 解决

- **区分 JWT 与明文 user id**：仅当 token **不像 JWT**（例如旧版明文 `users.id`）时，才用 `user.id !== token` 清理缓存。  
  - 涉及：`frontend/src/store/userStore.ts`（`isLikelyJwt` 与 `loadInitial`）。
- **有 token 即拉会话**：`bootstrap()` 仅依赖 `token`，不等待 `profileHydrated`。  
  - 涉及：`frontend/src/components/layout/AppShell.tsx`。
- **侧栏会话区域**：有 `token` 即展示（与资料是否拉完解耦）。  
  - 涉及：`frontend/src/components/layout/Sidebar.tsx`。
- **对话页输入与同步提示**：不再用「未 `profileHydrated`」一律禁用输入；在「有 token、尚无 user、且仍在等待/失败」等状态下再禁用，并区分「同步中」与「明确失败」。  
  - 涉及：`frontend/src/pages/Chat/index.tsx`、`frontend/src/pages/Settings/index.tsx`。

---

## 5. 显示名称大小写（Jack / jack）与多账号

### 现象

使用 `jack` 登录与使用 `Jack` 登录，看到的会话历史不一致或像「新号」。

### 原因

- 后端 `UserRepository.findByName` 使用**大小写敏感**匹配；`Jack` 与 `jack` 在数据库中视为**两个不同用户**，会话与任务各自归属不同 `user_id`。

### 排查

- 在 D1 / 数据库中查询 `users` 表是否存在多条仅大小写不同的 `name`。
- 登录时确认输入的显示名称与历史注册时是否**完全一致**（含大小写）。

### 解决（产品 / 运维层面）

- 统一使用同一套显示名称登录；或后续需求中考虑「名称归一化 / 大小写不敏感唯一」等（需改库与接口约定，**未在默认代码中自动合并账号**）。

---

## 修订说明

| 日期       | 摘要 |
| ---------- | ---- |
| 2025-03-21 | 初稿：汇总会话排序、UI、终端误解、JWT 登录态、大小写账号等条目。 |
