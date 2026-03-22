# 后端生产环境配置与部署（阶段六 · 任务 6.1）

在 Cloudflare 上为 **独立生产资源** 建 D1、R2，用 **Secrets** 注入密钥，再部署 Worker 并做健康检查。以下命令默认在仓库 **`backend/`** 目录执行。

## 1. 准备生产配置文件

```bash
cd backend
cp wrangler.production.toml.example wrangler.production.toml
```

编辑 **`wrangler.production.toml`**：

1. 将 **`database_id`** 换为你在步骤 2 创建的 D1 ID（UUID）。
2. 将 **`bucket_name`** 换为你在步骤 3 创建的 R2 桶名（若与示例不同）。
3. 按需修改 **`name`**（Worker 名称，账号内需唯一）。
4. （可选）自定义域名：取消 **`routes`** 注释，填写 **`pattern`** 与 **`zone_name`**，并在 Dashboard 为该域开启 Workers 路由。

> **`wrangler.production.toml` 已加入 `.gitignore`，勿把含真实 ID 的文件提交到 Git。**

## 2. 创建生产 D1 并迁移

```bash
npx wrangler d1 create task-assistant-db-production
```

把输出里的 **`database_id`** 写入 `wrangler.production.toml` 的 `[[d1_databases]]`。

对**远程**生产库执行迁移（与本地 `migrations/` 一致）：

```bash
npm run db:apply:production
```

（等价于 `wrangler d1 migrations apply task-assistant-db-production --remote --config wrangler.production.toml`。）

首次上线后可按需执行种子或管理数据（勿在生产随意执行开发用 seed）：

```bash
# 示例：仅当你明确需要时，对远程 D1 执行 SQL
# npx wrangler d1 execute task-assistant-db-production --remote --config wrangler.production.toml --file=./scripts/xxx.sql
```

## 3. 创建生产 R2 Bucket

在 Cloudflare Dashboard → **R2** → **Create bucket**，名称与 `wrangler.production.toml` 中 **`bucket_name`** 一致（示例：`task-assistant-files-production`）。

若前端需要 **预签名直传**，在同一 bucket 配置 **CORS**（允许你的前端源、`PUT`/`GET`/`HEAD`），并创建 **R2 API Token**（S3 兼容密钥），在下面 Secrets 中配置。

## 4. 配置 Secrets（生产密钥）

以下密钥**不要**写进 `wrangler.production.toml` 的 `[vars]`，使用 Wrangler 写入加密存储：

```bash
CONFIG=wrangler.production.toml

npx wrangler secret put JWT_SECRET              --config "$CONFIG"
# 二选一 LLM：
npx wrangler secret put DASHSCOPE_API_KEY       --config "$CONFIG"   # LLM_PROVIDER=qwen
# npx wrangler secret put GEMINI_API_KEY       --config "$CONFIG"   # LLM_PROVIDER=gemini

npx wrangler secret put SERPER_API_KEY           --config "$CONFIG"
npx wrangler secret put QDRANT_API_KEY          --config "$CONFIG"

# 预签名下载 / 分片直传（可选）：
# npx wrangler secret put R2_S3_ACCESS_KEY_ID     --config "$CONFIG"
# npx wrangler secret put R2_S3_SECRET_ACCESS_KEY --config "$CONFIG"

# 管理员 Prompt API（若使用）：
# npx wrangler secret put ADMIN_API_SECRET       --config "$CONFIG"
```

查看已配置名称（不显示值）：

```bash
npx wrangler secret list --config wrangler.production.toml
```

## 5. 非敏感变量（`[vars]`）

`wrangler.production.toml` 中 `[vars]` 已包含与开发类似的 **`LLM_MODEL`**、**`QDRANT_URL`**、**`EMBEDDING_DIMENSIONS`** 等。生产务必：

- 将 **`JWT_SECRET`** 从任何提交的 toml 中移除（仅用 secret）。
- 核对 **`QDRANT_URL` / `QDRANT_COLLECTION` / `EMBEDDING_DIMENSIONS`** 与线上 Qdrant Collection 一致。
- 填写 **`R2_ACCOUNT_ID`**（若使用预签名 URL）。

## 6. 部署与验证

一键部署（含 `typecheck` + `test`）：

```bash
npm run deploy:production
```

仅部署（跳过本地检查）：

```bash
npx wrangler deploy --config wrangler.production.toml
```

部署成功后，控制台会打印 **`workers.dev`** 默认域名。健康检查（将 URL 换成你的 Worker 根地址）：

```bash
./scripts/verify-production-endpoints.sh https://<your-worker>.workers.dev
```

或手动：

```bash
curl -sS "https://<your-worker>.workers.dev/health"
curl -sS "https://<your-worker>.workers.dev/health/llm"
curl -sS "https://<your-worker>.workers.dev/health/db"
curl -sS "https://<your-worker>.workers.dev/health/qdrant"
curl -sS "https://<your-worker>.workers.dev/health/memory"
```

前端将 **`VITE_API_BASE`**（或项目内等价配置）指向该 Worker 根 URL（含 `https://`，无尾斜杠）。

## 7. 自定义域名（可选）

1. 在 `wrangler.production.toml` 配置 **`routes`**（或 Dashboard：**Workers** → 该 Worker → **Triggers** → **Custom Domain**）。
2. 确保 DNS **橙色云** 代理到 Cloudflare。
3. 用自定义域重复执行 **`verify-production-endpoints.sh https://api.yourdomain.com`**。

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| 部署报 D1 / R2 绑定错误 | 检查 `database_id`、bucket 名与账号是否一致；`wrangler whoami` 确认登录账号。 |
| `/health/llm` 为未配置 | 对应 Provider 的 secret 未设置或 `LLM_PROVIDER` 与密钥不匹配。 |
| `/health/memory` 未就绪 | `QDRANT_URL` + `QDRANT_API_KEY` + 嵌入维度与 collection。 |
| 文件上传 503 | 未绑定 R2：确认 `[[r2_buckets]]` 与桶存在。 |

---

**任务 6.1 验收**：生产 D1 + R2 已创建、迁移已执行、Secrets 已配置、`deploy:production` 成功、`verify-production-endpoints` 通过（或等价 curl）。
