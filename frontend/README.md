# 前端（`frontend/`）

与仓库根目录 **`backend/`** 并列的 Vite + **React 18** + TypeScript 应用，对齐 `docs/technical/tech_design_frontend_v1_2.md` 与 `docs/tasks/tasks_frontend_v1_2.md`。

**E2E（Playwright）与生产构建验收的完整可复现说明**：[`docs/testing/frontend_e2e_and_build.md`](../docs/testing/frontend_e2e_and_build.md)（任务 7.2 / 7.3）。

## 前置

- Node.js 18+（与后端 README 一致）。当前锁定 **Vite 5** 以便在 Node 20.17 等环境稳定构建；若本机已 ≥20.19，亦可后续再评估升级 Vite 大版本。
- 在 **`frontend/`** 目录安装依赖：`npm install`

## 脚本

| 命令                   | 说明                                     |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | 开发服务器（默认 http://localhost:5173） |
| `npm run build`        | 类型检查 + 生产构建                      |
| `npm run preview`      | 预览构建产物                             |
| `npm run lint`         | ESLint                                   |
| `npm run format`       | Prettier 写入                            |
| `npm run format:check` | Prettier 检查                            |
| `npm run test:e2e`     | Playwright 端到端（阶段七 · 7.2）        |
| `npm run test:e2e:ui`  | Playwright UI 模式                       |

## 端到端测试（Playwright，任务 7.2）

**完整步骤、前置条件、规格对照、CI 与排错**以 **[`docs/testing/frontend_e2e_and_build.md`](../docs/testing/frontend_e2e_and_build.md)** 为准。以下为最常用快捷命令。

> **`E2E_BASE_URL` 必须是前端（Vite，默认 5173），不是 Worker API（8787）。** 浏览器先打开 SPA，再由 Vite 把 `/api` 代理到 `127.0.0.1:8787`。

1. **终端 A**：`cd ../backend && npm run dev`（API：`http://localhost:8787` 或 `http://127.0.0.1:8787`）。
2. **终端 B（可选）**：`cd frontend && npm run dev`。若省略，在已设 **`E2E_BASE_URL`** 且**未**设 **`E2E_SKIP_WEB_SERVER=1`** 时，Playwright 会自动执行 `npm run dev` 拉起 Vite。
3. **首次**：`cd frontend && npx playwright install chromium`。
4. **跑用例**（须设置基址，否则全部 skip 且退出码 0）：

   ```bash
   cd frontend
   E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
   ```

5. **可选环境变量**：
   - **`E2E_CHAT_STREAM=1`**：启用流式对话用例（依赖 LLM / SSE，易超时）。
   - **`E2E_MULTIPART=1`**：启用约 6MB 分片上传用例（较慢）。

6. **调试 UI**：`E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e:ui`。

## 工作空间文件 API（与后端契约）

- **列表**：`GET /api/workspace`（`folder`、`type` 查询参数）。
- **列表增量 / 处理中状态**：`GET /api/workspace/events`（`text/event-stream`）；前端在存在 `processed === 0` 时优先订阅，失败则回退静默轮询同一路径的 GET 列表。
- **上传、分片完成、重命名、标签、下载等**：仍为 `/api/files/...`（根路径 `GET /api/files` 已移除，勿再依赖）。

实现见 `src/api/files.ts`、`src/hooks/useFiles.ts`。

## 环境变量

- 复制 **`.env.example`** 为 **`.env`**（或 **`.env.local`**，已被 `.gitignore` 忽略）。
- **`VITE_API_BASE`**：生产构建**必须**设为后端 HTTPS 根 URL（无尾部斜杠），见技术方案 §5.1。
- 本地开发可将 `VITE_API_BASE` 留空：请求 **`/api/*`** 由 Vite 代理到 **`http://127.0.0.1:8787`**（`wrangler dev` 默认端口）。

**重要**：`VITE_*` 由 Vite 在 **`npm run build` 时**写入 JS 包。  
**本机** `npm run build` 只认：**当前 shell 的环境变量**、以及 **`frontend/` 下的 `.env` / `.env.production` 等文件**（见 [Vite 环境变量](https://vitejs.dev/guide/env-and-mode.html)）。  
**Cloudflare 控制台**里配的 `VITE_API_BASE` 只有在 **Cloudflare 替你跑 `npm run build`**（例如 Git 连接 Pages、在云端构建）时才会注入；**不会**作用在你已经打好的 `dist` 上。

## 部署到 Cloudflare Pages

### 方式一：本机构建 + `wrangler pages deploy dist`（你当前的方式）

控制台 **Environment variables 对这次构建无效**。必须在**执行 build 的那台机器**上提供 `VITE_API_BASE`，例如任选其一：

- **单次命令**（在 `frontend/` 目录，macOS / Linux）：

  ```bash
  VITE_API_BASE=https://ai-task-assistant.785748374.workers.dev npm run build
  npx wrangler pages deploy dist --project-name=jack-ai-bot
  ```

- **或** 在 `frontend/` 下新增文件 **`.env.production`**（`vite build` 默认会读），内容为一行：  
  `VITE_API_BASE=https://ai-task-assistant.785748374.workers.dev`  
  然后再 `npm run build` 和 `wrangler pages deploy`。可参考仓库里的 **`.env.production.example`**。

Windows CMD 可先执行：`set VITE_API_BASE=https://ai-task-assistant.785748374.workers.dev` 再在同一窗口 `npm run build`。

### 方式二：Git 连接 Pages，由 Cloudflare 云端构建

1. 仓库连接 Pages，**Build 根目录**为 **`frontend/`**，Build command 为 **`npm run build`**（或项目实际命令），输出目录 **`dist`**。
2. 在 **Settings → Environment variables → Production** 设置 `VITE_API_BASE` = `https://<你的-worker>.workers.dev`（无尾部斜杠）。
3. **Push** 触发构建；在 **Deployments** 里打开**最新一条**查看 **Build log**。  
   说明：若项目从未接 Git、一直是「本地上传」，界面上往往**没有**「Retry deployment」；那是**云端构建**流水线的入口。接好 Git 并触发一次云端 build 后才会熟悉这一套。

### 自检

打开线上站点 → **Network**，API 请求应是 `https://…workers.dev/api/...`。若仍是 `127.0.0.1:8787`，说明**本次 `npm run build` 时**仍未带上正确的 `VITE_API_BASE`（例如只用了空的 `.env`）。  
登录页 toast 里的 `127.0.0.1:8787` 是**固定提示文案**，以 Network 里的 **Request URL** 为准。

### Vercel（任务 7.3）

- 在 Vercel 项目中将 **Root Directory** 设为 **`frontend`**，**Build Command** `npm run build`，**Output** `dist`。
- 在 **Environment Variables** 中为 **Production** 设置 **`VITE_API_BASE`**（同上，无尾部斜杠）。
- 后端 **CORS** 须允许 Vercel 站点来源（与 Cloudflare Worker 配置方式一致，见技术方案 §12）。

### 构建验收（任务 7.3）

在 **`frontend/`** 下执行 **`npm run build`**（读取 `vite.config.ts`、环境变量与 `tsconfig`）应无类型错误且产出 **`dist/`**。发布前用 **`npm run preview`** 本地抽查静态资源与路由。更细的 **`VITE_API_BASE`** 与自检步骤见 **[`docs/testing/frontend_e2e_and_build.md`](../docs/testing/frontend_e2e_and_build.md) §10**。

## 路径别名

- **`@/`** → **`src/`**（见 `vite.config.ts`、`tsconfig.app.json`）。

## 技术栈（任务 1.1）

- Vite、React 18、TypeScript
- Tailwind CSS + PostCSS + Autoprefixer
- ESLint（flat config）+ `eslint-config-prettier`
- Prettier
