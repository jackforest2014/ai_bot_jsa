# 前端 E2E（Playwright）与生产构建验收

本文档与 **`docs/tasks/tasks_frontend_v1_2.md`** 阶段七任务 **7.2**（Playwright）、**7.3**（构建与部署验收）对齐，给出**可逐步复现**的操作说明。实现与配置以仓库内代码为准：`frontend/e2e/`、`frontend/playwright.config.ts`、`frontend/vite.config.ts`。

---

## 1. 范围与规格位置

| 类型 | 路径 / 命令 |
|------|-------------|
| Playwright 规格 | **`frontend/e2e/*.spec.ts`** |
| 公共步骤（登录、侧栏会话区） | **`frontend/e2e/helpers.ts`** |
| Playwright 配置 | **`frontend/playwright.config.ts`** |
| 前端开发服务器代理 | **`frontend/vite.config.ts`**（`/api` → `http://127.0.0.1:8787`） |

---

## 2. 前置条件（务必满足后再跑 E2E）

### 2.1 通用

- **Node.js**：≥ 18（与 `frontend/package.json` `engines`、后端 README 一致）。
- **依赖**：在仓库根目录分别安装：
  - `cd backend && npm install`
  - `cd frontend && npm install`

### 2.2 后端（`backend/`）

E2E 会真实调用 **`/api/*`**（经 Vite 代理到本机 Worker）。请按 **`backend/README.md`** 完成至少：

1. **D1**：创建库、写入 `wrangler.toml` 的 `database_id`，执行本地迁移（如 `npm run db:apply:local`）。
2. **匿名登录**：`JWT_SECRET` 等见 `wrangler.toml` / `.dev.vars`；确保 **`POST /api/auth/login`**、**`GET /api/auth/profile-exists`** 可用。
3. **启动 Worker**（默认 **`http://127.0.0.1:8787`**）：

   ```bash
   cd backend
   npm run dev
   ```

4. **健康检查**（另开终端，可选但强烈建议）：

   ```bash
   curl -sS http://127.0.0.1:8787/health
   curl -sS http://127.0.0.1:8787/health/db
   ```

若匿名登录或会话接口返回 5xx/401，请先对照 **`backend/README.md`** 排查（如 D1 未迁移、JWT 未配置）。

### 2.3 与用例相关的可选能力

| 能力 | 影响的 E2E 规格 | 说明 |
|------|-----------------|------|
| **R2 绑定** + 预签名/CORS（见后端 README） | **`files-upload.spec.ts`**（小文件、分片） | 未绑 R2 时上传相关接口可能失败，对应用例会失败。 |
| **LLM / `POST /api/chat/stream` 可用** | **`chat-stream.spec.ts`**（仅 `E2E_CHAT_STREAM=1` 时启用） | 需配置 Gemini 或千问等，且会话、流式路由正常。 |
| **任务 API** | **`settings-tasks.spec.ts`** 中的任务用例 | 若后端未实现任务接口，该条会失败。 |
| **用户资料 API** | **`settings-tasks.spec.ts`** 中的设置用例 | 依赖 **`PUT /api/user`**、**`PUT /api/user/ai-name`** 成功。 |
| **无特殊要求** | **`login-sessions.spec.ts`**、**`auth-flow.spec.ts`**、**`smoke.spec.ts`** | 依赖匿名登录、会话等基础 API。 |
| **文件列表** | **`offline-cache.spec.ts`** | 依赖 **`GET /api/workspace`** 成功一次以写入列表缓存相关 IndexedDB。 |

---

## 3. 前端开发服务器（E2E 默认连 Vite）

E2E 通过浏览器访问 **前端地址**（默认 **`http://127.0.0.1:5173`**），由 Vite 把 **`/api`** 代理到 **`http://127.0.0.1:8787`**（与你在浏览器里用 `localhost:8787` 访问 Worker 是同一后端）。

> **常见误解**：**`E2E_BASE_URL` 不要填 `http://localhost:8787`**。8787 是 **API（Worker）**，返回的不是 Vite 里的 React 页面；Playwright 必须打开 **5173 上的前端**，由前端再请求 `/api/*`。若出现 **`net::ERR_CONNECTION_REFUSED` 且目标端口是 5173**，表示 **Vite 未启动**；在已设置 `E2E_BASE_URL` 时，`playwright.config.ts` 会**尝试自动执行 `npm run dev`**（除非设置 **`E2E_SKIP_WEB_SERVER=1`**）。

1. **环境变量**（在 `frontend/`）：
   - 联调 E2E 时建议 **`VITE_API_BASE` 留空**（使用 `.env` / `.env.local` 复制自 **`.env.example`** 即可），以便走代理。
2. **启动**：

   ```bash
   cd frontend
   npm run dev
   ```

3. 浏览器手动打开 `http://127.0.0.1:5173` 能打开登录或应用壳即可。

> **注意**：若设置 **`VITE_API_BASE` 指向远程 Worker**，而 E2E 仍访问本机 `5173`，则请求发往远程；此时须保证该 Worker CORS 允许 `http://127.0.0.1:5173`，且与本地 D1 数据不一致可能导致用例不稳定。**推荐 E2E 使用「本机 backend + 本机 frontend + 空 VITE_API_BASE」**。

---

## 4. 安装 Playwright 浏览器

首次在本机或 CI 上跑 E2E 前执行（在 **`frontend/`**）：

```bash
cd frontend
npx playwright install chromium
```

若未安装，会出现类似 **`Executable doesn't exist ... chromium_headless_shell`** 的错误。

---

## 5. 环境变量约定

| 变量 | 是否必填 | 作用 |
|------|----------|------|
| **`E2E_BASE_URL`** | **跑真实 E2E 时必填**（建议显式设置） | 作为 Playwright **`baseURL`**（见 `playwright.config.ts`）。**未设置或为空字符串时，所有依赖后端的用例会 `skip`，`npm run test:e2e` 仍可成功退出（0）。** |
| **`E2E_CHAT_STREAM=1`** | 可选 | 仅当与 **`E2E_BASE_URL`** 同时生效时，才会注册 **`chat-stream.spec.ts`** 中的流式对话用例（否则该 `describe` 整体 `skip`）。 |
| **`E2E_MULTIPART=1`** | 可选 | 与 **`E2E_BASE_URL`** 同时生效时，额外运行约 **6MB** 的分片上传用例（慢、占内存与带宽）。 |
| **`E2E_SKIP_WEB_SERVER=1`** | 可选 | 已设置 **`E2E_BASE_URL`** 时，**禁止** Playwright 自动拉起 `npm run dev`（须自行先开好 Vite）。 |

**示例（macOS / Linux，在 `frontend/` 目录）：**

```bash
export E2E_BASE_URL=http://127.0.0.1:5173
npm run test:e2e
```

单行：

```bash
E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
```

**Windows CMD：**

```bat
set E2E_BASE_URL=http://127.0.0.1:5173
cd frontend
npm run test:e2e
```

**Windows PowerShell：**

```powershell
$env:E2E_BASE_URL="http://127.0.0.1:5173"
cd frontend
npm run test:e2e
```

启用流式与分片（慎用）：

```bash
E2E_BASE_URL=http://127.0.0.1:5173 E2E_CHAT_STREAM=1 E2E_MULTIPART=1 npm run test:e2e
```

---

## 6. 完整复现流程（推荐顺序）

按顺序执行；**终端 A** 与 **终端 B** 长期保持运行，**终端 C** 跑测试。

1. **终端 A — 后端**

   ```bash
   cd /path/to/ai_bot/backend
   npm install   # 首次
   npm run dev
   ```

2. **终端 B — 前端（可选手动；不设 `E2E_SKIP_WEB_SERVER` 时可由 Playwright 自动启动）**

   ```bash
   cd /path/to/ai_bot/frontend
   npm install   # 首次
   # 确认 VITE_API_BASE 未指向错误环境，或使用 .env.example 留空
   npm run dev
   ```

   若希望 **只开一个终端跑 E2E**：不设 **`E2E_SKIP_WEB_SERVER`**，在 **终端 A 已启动 backend** 的前提下，可直接执行步骤 4；Playwright 会在 **`E2E_BASE_URL` 对应端口**上启动 **`npm run dev -- --host 127.0.0.1 --strictPort`**（默认端口 **5173**）。若该端口已被占用，会复用已有进程（非 CI 时 **`reuseExistingServer: true`**）。

3. **终端 C — 安装浏览器（仅首次或升级 @playwright/test 后）**

   ```bash
   cd /path/to/ai_bot/frontend
   npx playwright install chromium
   ```

4. **终端 C — 运行 E2E**

   ```bash
   cd /path/to/ai_bot/frontend
   E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
   ```

5. **调试（可选）**

   ```bash
   cd /path/to/ai_bot/frontend
   E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e:ui
   ```

---

## 7. 规格文件与验收点对照

| 文件 | 行为说明 |
|------|----------|
| **`smoke.spec.ts`** | 访问 `/`，断言 `body` 可见。 |
| **`auth-flow.spec.ts`** | 打开 `/login`，断言 **`#login-name`**（显示名称）可见。 |
| **`login-sessions.spec.ts`** | **新用户**：随机显示名称登录 → 对话页与「对话输入」可见。**回访**：登出后同名称失焦 → 按钮「欢迎回来」→ 再次进入。**会话**：展开侧栏会话区、「新对话」、切换会话、**右键**会话行触发重命名并提交。 |
| **`files-upload.spec.ts`** | **默认**：`/files` 小文件上传 → 元数据弹窗选语义类型 → 等待 toast「已上传：e2e-small.txt」。**`E2E_MULTIPART=1`**：另组 describe 上传约 6MB 文件，走分片路径。 |
| **`settings-tasks.spec.ts`** | `/settings` 修改 **AI 助手昵称** 与 **偏好 JSON** → 保存 → toast「已保存设置」。对话页任务侧栏 **新建任务** → 列表出现标题 → 点击后 **任务详情** 区可见。 |
| **`offline-cache.spec.ts`** | 进入工作空间并等待 **`GET /api/workspace`** 成功后，在页面上下文中检查 IndexedDB 是否存在库名 **`ai-bot-files-cache`**。 |
| **`chat-stream.spec.ts`** | 仅 **`E2E_BASE_URL` + `E2E_CHAT_STREAM=1`** 时执行：发一条短消息，等待「正在生成回复…」或助手回复「好」。 |

---

## 8. CI 建议

- 在流水线中：**安装依赖** → **`npx playwright install --with-deps chromium`**（Linux 需系统依赖时）→ **启动 backend（8787）**（或对接固定桩环境）→ 设置 **`E2E_BASE_URL=http://127.0.0.1:5173`** → **`npm run test:e2e`**（Playwright 会在 CI 中启动 Vite，**`reuseExistingServer: false`**）。须保证 job 内 **`backend` 先于或可并行于** Playwright 的 `webServer` 就绪，否则 API 用例会失败。
- `playwright.config.ts` 中 **`forbidOnly: !!process.env.CI`**：CI 中禁止使用 `test.only`。
- **`retries`**：CI 下为 **1**，本地默认为 **0**。

若 CI **不启动真实后端**，可只跑 **`E2E_BASE_URL` 未设置** 的 job，此时全部 skip，用于校验 Playwright 安装与脚本无语法错误（不替代真实联调）。

---

## 9. 常见问题

| 现象 | 处理 |
|------|------|
| **`ERR_CONNECTION_REFUSED` 指向 `:5173`** | **前端 Vite 未监听**。请先 **`cd frontend && npm run dev`**，或去掉 **`E2E_SKIP_WEB_SERVER`** 让 Playwright 自动拉起 Vite。确认 **`E2E_BASE_URL` 是前端地址（5173），不是 8787**。 |
| **会话列表 E2E：点到 ⋯、高亮不对、找不到重命名 input** | 会话行外层是 **`role="button"`**，行内「⋯」也是 **`button`**，勿用 **`.getByRole('button').nth(1)`** 当第二行。应用 **`filter({ has: span.line-clamp-2 })` 限定会话行**，点「新对话」用 **`exact: true`**。进入重命名后该行不再有 **`line-clamp-2`**，应用 **`.max-h-64 input`** 找输入框，勿再链式用上面的 `rows`。 |
| Chromium 可执行文件不存在 | 在 `frontend/` 执行 **`npx playwright install chromium`**。 |
| 全部 skipped | **未设置 `E2E_BASE_URL`** 属预期；要跑真实用例请设置见 §5。 |
| 登录 / 会话 401、5xx | 查 **`backend`** 日志；确认 D1、JWT、迁移与 **`backend/README.md`** 健康检查。 |
| 上传失败 | 确认 Worker 已绑定 **R2**、CORS 允许 `http://127.0.0.1:5173` 对预签名 **PUT**（见后端 README）。 |
| 流式用例超时 | 属正常现象之一；确认 **`E2E_CHAT_STREAM=1`** 且 LLM 密钥与 **`/health/llm`** 正常；或不要启用该用例。 |
| 端口不是 5173 | 将 **`E2E_BASE_URL`** 改为实际 Vite 地址（与 `npm run dev` 输出一致）。 |

---

## 10. 生产构建验收（任务 7.3）

与 **`frontend/README.md`**「部署」章节一致，此处列为验收步骤：

1. 在 **`frontend/`** 为生产注入 **`VITE_API_BASE`**（HTTPS 根 URL，**无尾部斜杠**），任选其一：
   - Shell：`VITE_API_BASE=https://你的-worker.workers.dev npm run build`
   - 或复制 **`.env.production.example`** 为 **`.env.production`** 并编辑后执行 **`npm run build`**
2. 执行：

   ```bash
   cd frontend
   npm run build
   ```

   预期：**TypeScript 无错误**，产出 **`frontend/dist/`**。
3. 本地抽查：

   ```bash
   npm run preview
   ```

   浏览器打开预览地址，在 **Network** 中确认 API 指向 **`VITE_API_BASE`** 对应域名，而非 `127.0.0.1:8787`（除非故意本地预览仍代理）。
4. **CORS**：生产站点来源须在后端（Worker）允许，见技术方案 **§12** 与 **`backend/README.md`**。

---

## 11. 相关文档

- **`frontend/README.md`**：脚本表、部署 Cloudflare Pages / Vercel 摘要。
- **`docs/tasks/tasks_frontend_v1_2.md`**：阶段七任务定义。
- **`docs/technical/tech_design_frontend_v1_2.md`**：**§14 测试策略**、目录树中的 **`e2e/`** 说明。
