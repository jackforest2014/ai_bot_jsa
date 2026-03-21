# 前端（`frontend/`）

与仓库根目录 **`backend/`** 并列的 Vite + **React 18** + TypeScript 应用，对齐 `docs/technical/tech_design_frontend_v1_2.md` 与 `docs/tasks/tasks_frontend_v1_2.md`。

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

## 环境变量

- 复制 **`.env.example`** 为 **`.env`**（或 **`.env.local`**，已被 `.gitignore` 忽略）。
- **`VITE_API_BASE`**：生产构建**必须**设为后端 HTTPS 根 URL（无尾部斜杠），见技术方案 §5.1。
- 本地开发可将 `VITE_API_BASE` 留空：请求 **`/api/*`** 由 Vite 代理到 **`http://127.0.0.1:8787`**（`wrangler dev` 默认端口）。

## 路径别名

- **`@/`** → **`src/`**（见 `vite.config.ts`、`tsconfig.app.json`）。

## 技术栈（任务 1.1）

- Vite、React 18、TypeScript
- Tailwind CSS + PostCSS + Autoprefixer
- ESLint（flat config）+ `eslint-config-prettier`
- Prettier
