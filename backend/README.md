# ai-task-assistant Worker

Cloudflare Workers + Hono + TypeScript。已完成 **1.1–1.5**、**2.1–2.5**（含规则意图分类 §9.6）。

## 前置

- Node.js 18+（建议 ≥20.18 以消除部分依赖的 engine 警告）
- CLI：使用项目内 `npx wrangler`（无需全局安装）

## 首次配置

1. **D1**：`wrangler d1 create task-assistant-db`，将 `database_id` 写入 `wrangler.toml` 的 `[[d1_databases]]`。
2. **迁移**：
   - 本地：`npm run db:apply:local`
   - 远程：`npm run db:apply:remote`
3. **JWT 与匿名登录（阶段三）**  
   - `wrangler.toml` `[vars]` 已含 **`JWT_SECRET`**（本地可覆盖 `.dev.vars`）；生产务必 **`wrangler secret put JWT_SECRET`**。  
   - **`POST /api/auth/login`**：`{ "name", "email?" }` → `{ token, user, is_new_user }`；**`GET /api/auth/profile-exists?name=`** 预检名称是否已注册。  
   - **`Authorization: Bearer`**：若 token 形如 JWT（三段点分），用 `JWT_SECRET` 校验且 **`sub` = `users.id`**；否则仍支持明文 **`users.id`**（如 `local-dev-user`）。  
   - **`GET/POST /api/sessions`**、**`GET .../messages`**、**`PATCH ...`**、**`DELETE ...`**：会话 CRUD；**`POST /api/chat/stream`** 请求体须含 **`session_id`**（且属于当前用户）。  
4. **开发用户 `local-dev-user`（避免 `/api/user` 401）**  
   API 将 Bearer 解析为 **JWT `sub`** 或 **明文 `users.id`**；**该用户须在 D1 中存在**，否则返回「未授权」。
   - **本地** D1：`npm run db:seed:dev-user`
   - **远程**（已部署的 Worker 用的那份）D1：`npm run db:seed:dev-user:remote`（需已登录 wrangler、且 `wrangler.toml` 里 `database_id` 正确）  
   前端「一键登录」或粘贴令牌 `local-dev-user` 均依赖上述 seed（脚本会同时写入 **`sess-local-dev-user`** 默认会话，便于带 `session_id` 调流式接口）。仅 seed 本地时，**线上 Worker 仍会 401**。
5. **R2（对象存储，非数据库）**
   - 在 Cloudflare Dashboard 创建 bucket，名称与 `wrangler.toml` 中 `bucket_name` 一致（默认 `task-assistant-files`）。
   - 取消 `[[r2_buckets]]` 三行注释并 `wrangler deploy`。未创建 bucket 前**保持注释**，否则部署可能失败。
   - 代码已通过 `createFileStorage(env)` 适配：**无 `FILES` 绑定**时使用 `NullFileStorage`（调用上传/下载会抛错）；**有绑定**时使用 `R2Storage`。
6. **R2 预签名下载 URL（可选）**  
   绑定 bucket 只解决 Worker 内 `put/get`；生成浏览器可直接访问的带签名的 URL 还需要 **R2 的 S3 API 令牌**：
   - Dashboard → R2 → 该 bucket → **Manage R2 API Tokens**，创建具有对象读权限的密钥。
   - `wrangler.toml` `[vars]`：`R2_ACCOUNT_ID`（Cloudflare 账户 ID）、`R2_BUCKET_NAME`（已与默认一致时可不改）。
   - 密钥：`R2_S3_ACCESS_KEY_ID`、`R2_S3_SECRET_ACCESS_KEY` 写入 `.dev.vars` 或 `wrangler secret put`。
   - 四项齐全时，`R2Storage.getSignedUrl` 可用；否则仅 Worker 内读写不受影响，`getSignedUrl` 会抛明确错误。
7. **R2 CORS（前端直传预签名 URL 时需要）**  
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
8. **其他密钥**：`.dev.vars.example` → `.dev.vars`；生产用 `wrangler secret put`。
9. **Qdrant（任务 1.4）**  
   - 在 [Qdrant Cloud](https://cloud.qdrant.io/) 创建免费集群，拿到 **Cluster URL**（HTTPS，通常带端口 `:6333`，以控制台为准）与 **API Key**。  
   - 在控制台 **Create collection**：名称建议 **`memory`**（与 `wrangler.toml` 中 `QDRANT_COLLECTION` 一致），**Distance = Cosine**，**Vector size** 必须与后续使用的 **Embedding 模型输出维度** 完全一致（技术方案 §4.2 示例为 768；若你改用 Google `text-embedding-004` / `gemini-embedding-*` 等，**务必查官方文档中的 output dimension** 后再填）。  
   - 本地：在 `.dev.vars` 中设置 `QDRANT_URL`、`QDRANT_API_KEY`；可选覆盖 `QDRANT_COLLECTION`、`EMBEDDING_DIMENSIONS`（与 collection 的 vector size 一致）。  
   - 生产：`npx wrangler secret put QDRANT_API_KEY`；`QDRANT_URL` 可放在 Worker **Variables**（非密钥）或与密钥一同用 secret（团队约定即可）。  
   - **一键创建/校验 collection**（读取 `wrangler.toml` `[vars]` + `.dev.vars`）：`npm run qdrant:ensure-collection`（已存在则跳过创建）。  
   - 验证：`npm run dev` 后请求 **`GET /health/qdrant`**（已配置时应返回 `configured: true` 及 `status` / `points_count`）。
10. **大模型 LLM（Gemini 或通义千问）**  
   - **切换**：`wrangler.toml` `[vars]` 的 **`LLM_PROVIDER`**：`gemini` 或 **`qwen`**（亦识别 `dashscope`）。对话 / 嵌入模型名分别用 **`LLM_MODEL`**、**`EMBEDDING_MODEL`**；**向量维度须与 `EMBEDDING_DIMENSIONS` 及 Qdrant `memory` collection 一致**。  
   - **Gemini**：[Google AI Studio](https://aistudio.google.com/apikey) 创建 API Key → `.dev.vars` 的 **`GEMINI_API_KEY`**；生产：`npx wrangler secret put GEMINI_API_KEY`。嵌入常用 `text-embedding-004`（768）。  
   - **千问（百炼 OpenAI 兼容）**：在阿里云百炼获取 **API Key** → 本地 `.dev.vars` 的 **`DASHSCOPE_API_KEY`**；**已部署的 Worker** 必须执行 **`npx wrangler secret put DASHSCOPE_API_KEY`**（与本地同一把 key 即可，勿写 `Bearer ` 前缀）。若密钥地域非国内，另在 Dashboard **Workers** → 该 Worker → **Settings → Variables** 增加 **`DASHSCOPE_BASE_URL`**（或本地用 `.dev.vars` 测通后再同步到线上变量）。默认 Base 为中国大陆 `https://dashscope.aliyuncs.com/compatible-mode/v1`；国际见 [OpenAI 兼容说明](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)。对话常用 `qwen-plus` / `qwen-turbo`；嵌入常用 **`text-embedding-v3`**，代码会按 **`EMBEDDING_DIMENSIONS`** 传 `dimensions`（如 768）以匹配已有 Qdrant collection。  
   - 若日志出现 **DashScope 401**：多为密钥错误或 **密钥地域与 BASE_URL 不一致**（国内 key 配国内域名，国际 key 配 `dashscope-intl.aliyuncs.com`）；改 `.dev.vars` 后需 **重启** `wrangler dev`。  
   - 验证：`GET /health/llm`（`configured: true`，响应含 **`provider`**：`gemini` | `qwen`）。
11. **长期记忆（任务 2.2）**  
   - `MemoryService` = `VectorStore`（Qdrant）+ `LLMProvider.embed`。需 **Qdrant** 与 **当前 LLM 提供方密钥**（Gemini：`GEMINI_API_KEY`；Qwen：`DASHSCOPE_API_KEY`），`GET /health/memory` 为 `configured: true` 时 `createMemoryService(c.env)` 非空。  
   - 对话路由已用 `retrieveForRag` 注入上下文并下发 SSE `citation`。
12. **阶段四 · 深度研究与可选推理（任务 4.1–4.2）**  
   - 配置 **`SERPER_API_KEY`** 时注册 **`plan_research`**：内部 `PlannerService` + `SubAgent` 复用 **`search` 工具**，Serper 配额与软上限一致。  
   - **`ENABLE_TOT_GOT_TOOLS=true`**（Worker vars 或 `.dev.vars`）时注册 **`tree_of_thoughts`** / **`graph_of_thoughts`**（多轮 LLM，默认关闭）。  
   - **多 Agent 编排**：**`ORCHESTRATION_ENABLED=true`** 时 `POST /api/chat/stream` 走 **`OrchestrationService`**（分解、Task/Route 专责轮等，见 `docs/tasks/tasks_backend_multi_agent_orchestration.md`）。可选 **`TASK_AGENT_GOT_ENABLED`** / **`ROUTE_AGENT_GOT_ENABLED`**：编排内嵌轻量 GOT（与 `ENABLE_TOT_GOT_TOOLS` 独立，仍多轮 LLM）。  
   - **高德路线（`AMAP_WEB_KEY`）**：写入 `.dev.vars` 或 `wrangler secret put AMAP_WEB_KEY` 后注册 **`amap_geocode`**、**`amap_route_plan`**、**`amap_navigation_uri`**、**`amap_route_static_map`**；规则意图 **`route_query`** 会选用路线专用提示词（迁移 **`0011_route_query_prompt_amap.sql`**，请照常 `db:apply:local` / `remote`）。详见 `docs/agent/tools/gao_de_map/path_plan.md`。  
   - **提示词 · 联网找图（迁移 `0013_prompt_web_image_search_guidance.sql`）**：仅当用户**明确要求从网上找现成图片**时，用 **`search` + `type: "images"`** 并以 Markdown 图片展示；**不是**凡提到「图片」就检索。  
   - **工具调用审计表（迁移 `0012_tool_invocations.sql`）**：`POST /api/chat/stream` 每次工具执行写入 **`tool_invocations`**（`user_id`、`session_id`、`tool_name`、`ok`、`error_message`、`duration_ms`、`created_at` Unix 秒）。按时间区间统计：`GET /api/admin/tool-invocations/count?from_sec=&to_sec=`，可选 **`tool_name`**；鉴权与 **`/api/prompts`** 相同（`ADMIN_API_SECRET` + `Authorization: Bearer` 或 **`X-Admin-Token`**）。  
   - **按显示名删除用户（Demo）**：`POST /api/admin/users/purge-by-name`，请求体 JSON **`{ "name": "<显示名>" }`**，对应表 **`users.name`**（唯一），**非** JWT 里的 `users.id`。先删 **`file_uploads`**（含 R2）、**`serper_usage`**、Qdrant 点；**最后删除 `users` 表中该行**（`users.id`），其余 D1 子表多随外键 **ON DELETE CASCADE** 一并清空。**当前实现不要求鉴权**（仅本地/Demo）；**勿将暴露公网的 Worker 保持此行为**。其它 **`/api/admin/*`** 仍须 **`ADMIN_API_SECRET`**。实现：`src/services/purge-user-by-name.ts`；契约：`docs/api/openapi.yaml`（`AdminPurgeUserByName*`）。  
13. **阶段四 · 上传异步入库（任务 4.3）**  
   - 小文件/分片完成后的 **`waitUntil` 任务**：按 MIME 提取文本（pdf 启发式、docx/xlsx 经 `fflate` 解压解析），分块 **`MemoryService.addToMemory`**；图片/音视频为 **仅元数据**（`processed=1`，不向量化）；解析/向量失败 **`processed=-1`**。可选 **`FILE_EXCEL_MAX_ROWS`** 控制表格类提取体量（见 `file-text-extract.ts`）。

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
| `migrations/*.sql`      | Wrangler D1 迁移（含 `0009_chat_sessions_v14` 多会话 / `session_id` / users 约束） |
| `src/vector/*`          | `VectorStore`、`QdrantStore`（REST，Workers 可用） |
| `src/lib/logger.ts`     | 单行 JSON 日志（`wrangler tail`）；**文件**需用 `npm run dev:log` tee 到 `ai.log` |
| `scripts/wrangler-dev-with-log.mjs` | `dev:log`：进程级 tee，Worker 无法写宿主机磁盘 |
| `src/chat/log-llm-messages.ts` | 调试：`logger.debug` 输出发往 LLM 的每条 message（`msg":"chat llm_message"`），单条 `content` 超长会截断 |
| `src/observability/metrics.ts` | `recordMetric`（`analytics_metric` 埋点，阶段五 · 5.3） |
| `test/*.test.ts`        | Vitest 用例                                         |
| `src/lib/handle-error.ts` | Hono `onError` 统一 JSON                              |
| `src/errors/*`          | `AppError`、`ValidationError`、`DatabaseError` 等     |
| `src/llm/*`             | `LLMProvider`、`GeminiProvider`、`QwenProvider`（百炼兼容）、`createLlmProvider`、`embed` / `chat` / `chatStream` |
| `src/memory/*`          | `MemoryService`、`retrieve` / `addToMemory` / `retrieveForRag`、`createMemoryService` |
| `src/serper/*`          | Serper HTTP 客户端、`SerperQuotaService`、`serper_usage` 配合 |
| `src/files/file-service.ts` | `FileService.handleToolAction`（`manage_workspace_files`） |
| `src/tools/search-tool.ts`  | `search` 工具 |
| `src/tools/workspace-files-tool.ts` | `manage_workspace_files` |
| `src/tools/user-tool.ts`    | `update_user_profile` |
| `src/prompt/*`              | `PromptService`、`formatPreferencesSummary`、`{{PREFERENCES_BLOCK}}` |
| `src/intent/*`              | `IntentClassifier`、`RuleBasedIntentClassifier`、`KNOWN_INTENTS` |
| `src/chat/system-clock-block.ts` | 每条请求在 **system 最前**拼接**服务器当前时间**（UTC + 上海）及工具纪律（勿反驳与系统一致的日期、找图须 `search`+`images`、禁止自拟新闻图 URL） |
| `src/chat/history-for-llm.ts`   | 按**相对本会话内最近一条消息**的时间差做衰减：尾部若干条全文保留，较早条软截断 / 远条折叠；`route_query` 时阈值放宽（仍从 DB 取最近 20 条再处理） |
| `src/chat/detect-web-image-intent.ts` | 识别「网上/搜索找图 + 嵌入」类请求；已配置 Serper 时首轮**仅暴露 `search` + `tool_choice: required`**（与路线场景类似），减少纯文本拒答 |
| `src/db/schema.ts`      | Drizzle 表定义                                     |
| `src/db/repositories/*` | 各 Repository                                      |
| `drizzle.config.ts`     | 可选 schema 对照；**正式迁移以 wrangler SQL 为准** |

## 脚本

| 命令                      | 说明                       |
| ------------------------- | -------------------------- |
| `npm run dev`             | 本地开发（`wrangler dev`） |
| `npm run dev:log`         | 同上，且**追加**把子进程 stdout/stderr 写入本目录 **`ai.log`**（便于排查长会话；见下「本地日志」） |
| `npm run deploy`          | 部署到 Cloudflare（默认 `wrangler.toml`） |
| `npm run deploy:production` | 生产部署（需 `wrangler.production.toml`，见 **`docs/deployment/backend-production.md`**） |
| `npm run db:apply:production` | 对**生产** D1 执行迁移（库名 `task-assistant-db-production`，与 example 一致） |
| `npm run db:apply:local`  | 对**本地** D1 执行迁移     |
| `npm run db:apply:remote` | 对**远程** D1 执行迁移     |
| `npm run db:seed:dev-user` | 向**本地** D1 插入 `local-dev-user`（前端 Bearer / 一键登录） |
| `npm run db:seed:dev-user:remote` | 向**远程** D1 插入同上（Pages 连线上 Worker 一键登录前必做） |
| `npm run qdrant:ensure-collection` | 确保 Qdrant 中 `memory` collection 存在（Cosine、维度见 `EMBEDDING_DIMENSIONS`） |
| `npm run typecheck`       | TypeScript 检查            |
| `npm run lint`            | ESLint（含 `test/`）        |
| `npm run format`          | Prettier                   |
| `npm run test`            | Vitest 单元测试（阶段五 · 5.1） |
| `npm run test:watch`      | Vitest watch               |
| `npm run test:coverage`   | Vitest + 覆盖率            |
| `npm run loadtest:k6`     | k6 轻量压测（需本机安装 `k6`；见下「阶段六」） |

## 阶段六 · API 文档、用户手册与压测（6.2 / 6.3）

- **OpenAPI 3.0**：仓库根目录 [`docs/api/openapi.yaml`](../docs/api/openapi.yaml)  
  - 含 **`/api/auth/*`、`/api/sessions/*`、带 `session_id` 的 `POST /api/chat/stream`** 及 **SSE 事件说明与示例**。  
  - 可用 [Swagger Editor](https://editor.swagger.io/) 或 Redoc 本地打开该文件预览。
- **用户使用手册（中文）**：[`docs/user_manual_zh.md`](../docs/user_manual_zh.md)（功能说明与常见问题）。
- **容量规划与 k6**：[`docs/technical/capacity_and_load_testing.md`](../docs/technical/capacity_and_load_testing.md)（Workers 限制关注点、`API_BEARER_TOKEN` 等环境变量）。
- **压测脚本**：`scripts/k6/api-smoke.js`。先 `npm run dev`，另开终端：  
  `npm run loadtest:k6`  
  带登录压测：`API_BEARER_TOKEN=<JWT或用户id> npm run loadtest:k6`  
- **流式对话压测**：SSE 不宜高并发；说明与 curl 示例见 [`docs/technical/capacity_and_load_testing.md`](../docs/technical/capacity_and_load_testing.md) 第 5 节；soak 脚本：`npm run loadtest:k6:stream`（需设置 `CHAT_SESSION_ID`、`API_BEARER_TOKEN`）。  
- **真实 LLM：TTFT / 成功率 / 并发**：见同文档 **§6.4 完整可复现步骤**、**§6.5 输出范例解读**；脚本 `npm run loadtest:ttft`（数据集见 `scripts/load/datasets/`；需 `CHAT_SESSION_ID`、`API_BEARER_TOKEN`）。

## 阶段五 · 测试与埋点（5.1–5.3）

- **单元 / 组合测试**：`test/**/*.test.ts`；可选真机探测：先 `npm run dev`，再 `TEST_API_BASE=http://127.0.0.1:8787 npm run test` 会跑 `live-api` 用例。  
- **前端 E2E（Playwright）**：规格在 **`frontend/e2e/`**，配置在 **`frontend/playwright.config.ts`**。**可复现步骤**（前后端启动顺序、环境变量、用例说明、CI、排错）：[`docs/testing/frontend_e2e_and_build.md`](../docs/testing/frontend_e2e_and_build.md)。**`E2E_BASE_URL` 指前端 Vite（默认 5173），不是本机 `8787`；** 8787 仍须单独 `npm run dev` 供 Vite 代理 `/api`。  
- **监控**：`recordMetric` 写入与 `logger.info` 相同的 **单行 JSON**，字段含 **`msg: "analytics_metric"`** 与 **`metric`** 名（如 `llm_chat_stream`、`tool_execute`、`search_executed`、`file_upload`）。生产/预览可用 **`wrangler tail`** 过滤 `analytics_metric` 或具体 `metric` 值。

## 阶段六 · 生产部署（6.1）

独立生产 **D1 / R2**、**Secrets**、**`wrangler deploy`** 与上线后探测，见 **[`docs/deployment/backend-production.md`](../docs/deployment/backend-production.md)**。快速路径：`cp wrangler.production.toml.example wrangler.production.toml` → 填 **`database_id`** → `npm run db:apply:production` → 按文档 `wrangler secret put ...` → `npm run deploy:production` → `bash scripts/verify-production-endpoints.sh https://<worker>.workers.dev`。

## 验证

```bash
npm install
npm run db:apply:local
npm run db:seed:dev-user
npm run typecheck
npm run lint
npm run dev
# 另开终端：
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/health/db
curl http://127.0.0.1:8787/health/r2
curl http://127.0.0.1:8787/health/storage
curl http://127.0.0.1:8787/health/qdrant
curl http://127.0.0.1:8787/health/llm
curl http://127.0.0.1:8787/health/memory
curl http://127.0.0.1:8787/health/serper
curl http://127.0.0.1:8787/health/sse-chat
# 启用 R2 绑定后可测（对不存在 key 调 head，验证绑定可用）：
curl http://127.0.0.1:8787/health/r2/probe
```

- `GET /health/r2`：是否绑定 `FILES`、预签名环境变量是否齐全（不访问对象）。
- `GET /health/storage`：当前 `createFileStorage` 解析到的实现类名（`R2Storage` 或 `NullFileStorage`）。
