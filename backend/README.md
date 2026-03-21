# ai-task-assistant Worker

Cloudflare Workers + Hono + TypeScript。已完成任务 **1.1** 脚手架、**1.2** D1、**1.3** 文件存储抽象与 R2 实现（绑定可后开）、**1.4** Qdrant `VectorStore` 抽象与 `QdrantStore`（HTTP fetch）。

## 前置

- Node.js 18+（建议 ≥20.18 以消除部分依赖的 engine 警告）
- CLI：使用项目内 `npx wrangler`（无需全局安装）

## 首次配置

1. **D1**：`wrangler d1 create task-assistant-db`，将 `database_id` 写入 `wrangler.toml` 的 `[[d1_databases]]`。
2. **迁移**：
   - 本地：`npm run db:apply:local`
   - 远程：`npm run db:apply:remote`
3. **R2（对象存储，非数据库）**
   - 在 Cloudflare Dashboard 创建 bucket，名称与 `wrangler.toml` 中 `bucket_name` 一致（默认 `task-assistant-files`）。
   - 取消 `[[r2_buckets]]` 三行注释并 `wrangler deploy`。未创建 bucket 前**保持注释**，否则部署可能失败。
   - 代码已通过 `createFileStorage(env)` 适配：**无 `FILES` 绑定**时使用 `NullFileStorage`（调用上传/下载会抛错）；**有绑定**时使用 `R2Storage`。
4. **R2 预签名下载 URL（可选）**  
   绑定 bucket 只解决 Worker 内 `put/get`；生成浏览器可直接访问的带签名的 URL 还需要 **R2 的 S3 API 令牌**：
   - Dashboard → R2 → 该 bucket → **Manage R2 API Tokens**，创建具有对象读权限的密钥。
   - `wrangler.toml` `[vars]`：`R2_ACCOUNT_ID`（Cloudflare 账户 ID）、`R2_BUCKET_NAME`（已与默认一致时可不改）。
   - 密钥：`R2_S3_ACCESS_KEY_ID`、`R2_S3_SECRET_ACCESS_KEY` 写入 `.dev.vars` 或 `wrangler secret put`。
   - 四项齐全时，`R2Storage.getSignedUrl` 可用；否则仅 Worker 内读写不受影响，`getSignedUrl` 会抛明确错误。
5. **R2 CORS（前端直传预签名 URL 时需要）**  
   在 R2 bucket → **Settings → CORS**，按前端域名配置（示例）：
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173", "https://你的前端域"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```
6. **其他密钥**：`.dev.vars.example` → `.dev.vars`；生产用 `wrangler secret put`。
7. **Qdrant（任务 1.4）**  
   - 在 [Qdrant Cloud](https://cloud.qdrant.io/) 创建免费集群，拿到 **Cluster URL**（HTTPS，通常带端口 `:6333`，以控制台为准）与 **API Key**。  
   - 在控制台 **Create collection**：名称建议 **`memory`**（与 `wrangler.toml` 中 `QDRANT_COLLECTION` 一致），**Distance = Cosine**，**Vector size** 必须与后续使用的 **Embedding 模型输出维度** 完全一致（技术方案 §4.2 示例为 768；若你改用 Google `text-embedding-004` / `gemini-embedding-*` 等，**务必查官方文档中的 output dimension** 后再填）。  
   - 本地：在 `.dev.vars` 中设置 `QDRANT_URL`、`QDRANT_API_KEY`；可选覆盖 `QDRANT_COLLECTION`、`EMBEDDING_DIMENSIONS`（与 collection 的 vector size 一致）。  
   - 生产：`npx wrangler secret put QDRANT_API_KEY`；`QDRANT_URL` 可放在 Worker **Variables**（非密钥）或与密钥一同用 secret（团队约定即可）。  
   - **一键创建/校验 collection**（读取 `wrangler.toml` `[vars]` + `.dev.vars`）：`npm run qdrant:ensure-collection`（已存在则跳过创建）。  
   - 验证：`npm run dev` 后请求 **`GET /health/qdrant`**（已配置时应返回 `configured: true` 及 `status` / `points_count`）。

## 任务 1.3 相关代码

| 路径                               | 说明                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `src/storage/file-storage.ts`      | `FileStorage` 接口与 `FilePutOptions`                     |
| `src/storage/r2-storage.ts`        | `R2Storage`：`put` / `get` / `delete` / 分片 / 可选预签名 |
| `src/storage/r2-presign.ts`        | SigV4 查询参数预签名 GET（无 aws-sdk）                    |
| `src/storage/null-file-storage.ts` | 未绑定 R2 时的占位实现                                    |
| `src/storage/index.ts`             | `createFileStorage`、`hasR2Binding`、`hasR2PresignConfig` |

## 目录说明

| 路径                    | 说明                                               |
| ----------------------- | -------------------------------------------------- |
| `migrations/*.sql`      | Wrangler D1 迁移（0001–0007）                      |
| `src/vector/*`          | `VectorStore`、`QdrantStore`（REST，Workers 可用） |
| `src/db/schema.ts`      | Drizzle 表定义                                     |
| `src/db/repositories/*` | 各 Repository                                      |
| `drizzle.config.ts`     | 可选 schema 对照；**正式迁移以 wrangler SQL 为准** |

## 脚本

| 命令                      | 说明                       |
| ------------------------- | -------------------------- |
| `npm run dev`             | 本地开发（`wrangler dev`） |
| `npm run deploy`          | 部署到 Cloudflare          |
| `npm run db:apply:local`  | 对**本地** D1 执行迁移     |
| `npm run db:apply:remote` | 对**远程** D1 执行迁移     |
| `npm run qdrant:ensure-collection` | 确保 Qdrant 中 `memory` collection 存在（Cosine、维度见 `EMBEDDING_DIMENSIONS`） |
| `npm run typecheck`       | TypeScript 检查            |
| `npm run lint`            | ESLint                     |
| `npm run format`          | Prettier                   |

## 验证

```bash
npm install
npm run db:apply:local
npm run typecheck
npm run lint
npm run dev
# 另开终端：
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/health/db
curl http://127.0.0.1:8787/health/r2
curl http://127.0.0.1:8787/health/storage
curl http://127.0.0.1:8787/health/qdrant
# 启用 R2 绑定后可测（对不存在 key 调 head，验证绑定可用）：
curl http://127.0.0.1:8787/health/r2/probe
```

- `GET /health/r2`：是否绑定 `FILES`、预签名环境变量是否齐全（不访问对象）。
- `GET /health/storage`：当前 `createFileStorage` 解析到的实现类名（`R2Storage` 或 `NullFileStorage`）。
