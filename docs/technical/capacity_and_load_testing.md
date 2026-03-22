# 容量规划与负载测试（阶段六 · 6.3）

本文说明如何在 **Cloudflare Workers** 部署形态下做轻量压测，以及需要关注的**配额与限制**。**具体数字以 Cloudflare 官方定价、仪表盘与文档为准**，此处为规划检查清单。

## 压测前先想清楚要测什么

不同目标对应不同工具与解读方式，混用容易产生误导结论。实施压测前建议先明确属于哪一类（可多选，但应**分开设计实验、分开出报告**）：

| 类型 | 你要回答的问题 | 典型手段 | 结果主要反映 |
|------|----------------|----------|----------------|
| **A. 链路 / 可用性** | Worker、鉴权、`session_id`、路由是否正常？首包多快？ | `curl` 短超时、低并发探测 | 端到链路基线，未必触达模型瓶颈 |
| **B. 端到端整段流** | 从发起到 `done` 的总耗时、错误率？ | k6 `chat-stream-soak.js`、VU 很小 | Worker + LLM + 工具 + 网络整体；长连接占用明显 |
| **C. Worker 自身容量（不含真 LLM）** | 在固定响应形态下，Worker 能扛多少 QPS / 并发连接？ | **Mock SSE**（不调模型）+ k6 等 | 运行时与 CPU/子请求上限；**不能**替代 A/B |

**原则**：若被测路径会调用**真实大模型**，高并发下结果往往由 **供应商 RPM/TPM、429、队列** 主导，应明确标注为「**真实 LLM 路径下的观测**」，而不是「Worker 代码的理论极限」。

---

## 1. 推荐工具：k6

### 1.1 k6 里的 VU 是什么？

**VU** 是 **Virtual User**（**虚拟用户**）的缩写。k6 会启动若干 VU，每个 VU **独立、循环**执行脚本里的 `default` 函数（可类比「并发用户线程」）。VU 数越高，同一时刻在跑的迭代越多（在到达 `await`/网络等待时，VU 会挂起，让出事件循环给其他 VU）。

**注意**：VU **不是**「真实浏览器用户数」的精确建模，也不等于 HTTP 连接数一一对应；它表示 k6 调度下的**并发执行槽位**。对 SSE 长请求，每个 VU 在一次迭代里会长时间占住，直到响应结束或超时。

仓库在 `backend/scripts/k6/api-smoke.js` 提供 **k6** 脚本，用于：

- 对 **`/health`** 等无鉴权接口做并发冒烟；
- 在设置 **`API_BEARER_TOKEN`** 时对 **`/api/sessions`**、**`GET /api/workspace`**（文件列表）等需登录接口抽样压测。

### 安装与运行

1. 安装 [k6](https://k6.io/docs/get-started/installation/)（本机 PATH 可用 `k6 version`）。
2. 本地 Worker：`npm run dev`（默认 `http://127.0.0.1:8787`）。
3. 执行：

```bash
cd backend
k6 run scripts/k6/api-smoke.js
```

环境变量（可选）：

| 变量 | 说明 |
|------|------|
| `API_BASE` | 基址，默认 `http://127.0.0.1:8787` |
| `API_BEARER_TOKEN` | JWT 或明文用户 id；未设则只压测公开 health |
| `K6_VUS` | 虚拟用户数，默认 `10` |
| `K6_DURATION` | 持续时间，默认 `30s` |

示例：

```bash
API_BASE=https://your-worker.workers.dev \
API_BEARER_TOKEN='your-jwt' \
K6_VUS=20 K6_DURATION=1m \
k6 run scripts/k6/api-smoke.js
```

### 注意

- **`POST /api/chat/stream`** 为长连接 SSE，k6 默认 `http.get/post` 会等待完整响应，易占满 VU；**不宜**与高并发简单接口混在同一脚本里大流量压测。对话容量建议以「单用户串行 + 监控 CPU/错误率」为主，或编写专用 k6 场景（短超时、仅验证首包）。
- 压测会消耗 **LLM / Serper / Qdrant** 等外部配额，勿对生产无节制加压。

## 2. Cloudflare Workers 侧需关注的限制

压测或上线前请自行对照官方最新说明核对：

- **CPU 时间**：单次请求有 CPU 时间上限；流式对话、多轮工具调用、大 JSON 易接近上限，表现为 **1101/超时** 类错误。
- **子请求（subrequest）**：Worker 内外部 `fetch` 次数有限制；单次对话若触发多次模型请求、搜索、向量库，会叠加子请求。
- **并发与每日请求量**：免费/付费档的每日请求数、突发限制不同。
- **D1**：读写字节数、行数、语句数限制；高并发短读可缓存到 KV/R2 的策略不在本文范围。
- **R2**：Class A/B 操作计费与速率。

## 3. 容量规划建议

1. **基线**：对 `GET /health`、`GET /api/sessions`、`GET /api/workspace`（带 token）跑 k6，记录 **p95 延迟、错误率**。
2. **对话**：单会话串行发 10～20 条，观察 **wrangler tail** 与 `analytics_metric` 日志中的 `llm_chat_stream`、`tool_execute` 耗时。
3. **文件**：大文件走分片上传，压测重点放在 **initiate/complete** 与 R2 预签名成功率，而非 Worker 体本身 QPS。
4. **告警**：生产建议对 **5xx 比例、P99 延迟、LLM 错误码** 做简单告警（Logpush / 外部 APM 等）。

## 4. wrangler tail

```bash
npx wrangler tail
```

结合阶段五埋点，可过滤 `analytics_metric` 或 `http` 请求日志，观察压测期间瓶颈。

---

## 5. 如何压测 `POST /api/chat/stream`（SSE）

流式接口的特点是：**单请求耗时长**、会拉 **LLM / 工具 / 向量** 子请求，且 k6 默认会**等到响应体结束**才释放 VU。因此不要把它和 `/health` 一样用「高 VU × 短请求」去压。

上文 **「压测前先想清楚要测什么」** 中的 **A / B / C** 与本节对应：**A** 见 5.2 **curl**；**B** 见 5.3 **k6 soak**；**C** 需自建 mock，见 5.5。

### 5.2 快速探活：curl（适合 TTFB / 是否 200）

`-N` 禁用缓冲，便于尽快看到首帧；`--max-time` 到点断开，**不必等模型说完**：

```bash
API_BASE=http://127.0.0.1:8787
TOKEN='<JWT 或用户 id>'
SESSION_ID='<会话 UUID>'

curl -sS -N --max-time 8 -X POST "$API_BASE/api/chat/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"hi\",\"session_id\":\"$SESSION_ID\"}" | head -n 20
```

若在 8 秒内能看到 `event:` 行，说明鉴权、`session_id`、路由与流式响应基本正常。

### 5.3 k6：等整段流结束（soak，对应目标 B）

仓库脚本：`backend/scripts/k6/chat-stream-soak.js`。

```bash
cd backend
export CHAT_SESSION_ID='<你的 session_id>'
export API_BEARER_TOKEN='<JWT 或用户 id>'
# 可选：整流超时（须大于单次对话最坏耗时）
export CHAT_STREAM_TIMEOUT=120s
export K6_VUS=2
export K6_DURATION=3m
k6 run scripts/k6/chat-stream-soak.js
```

或使用 npm：`npm run loadtest:k6:stream`（见 `backend/package.json`）。

含义：**每个 VU 每次迭代发 1 次流式请求并阻塞到流结束**（或超时失败）。VU 建议 **≤5**；对**生产**会消耗 **LLM 费用与速率**，请只在预发或限额环境加压。

### 5.4 不建议的做法

- 用 **20+ VU** 长时间跑真流式接口：易触发 **LLM 429/5xx**、**Worker CPU/子请求** 上限，结果反映的是「供应商限流」而非「你的代码极限」。
- 期望 k6 在默认 API 里「读到首包就断开」：标准 `http` 模块不擅长精细的 SSE 截断，需要自写扩展、或改用 **Node/Python 客户端 + AbortController** 做专项脚本。

### 5.5 若只测「能承受多少并发长连接」（目标 C）

应在 **不调用真实大模型** 的前提下测（例如返回固定 SSE 的 mock Worker），单独测 **连接数、首字节时间、1101**；与「真实 chat stream」业务压测分开报告。

---

## 6. 真实 LLM：并发、QPS、首 token 时延（TTFT）与成功率

本节对应「在**真实 LLM** 路径上，能同时处理多少请求、首字延迟分布、成功比例」类问题。结论会混合 **Worker、网络、意图/RAG、模型侧队列与限流**；报告时需写清环境与供应商套餐。

### 6.1 指标定义（与本仓库 SSE 契约一致）

| 指标 | 定义 |
|------|------|
| **TTFT（Time To First Token）** | 从客户端**发起** `POST /api/chat/stream` 起，到收到**首个** `event: token` 且 `data` 中 `content` **非空** 为止的耗时（毫秒）。包含网络 RTT、Worker 内意图/RAG/首包模型延迟。 |
| **成功** | 在上述超时时间内观测到满足条件的首个 token；否则记失败（含 HTTP 非 2xx、`no_first_token_before_close`、`timeout_or_aborted` 等）。 |
| **成功率** | `成功次数 / 总请求数`。 |
| **QPS / 吞吐** | `总请求数 / 墙钟时间`（脚本结束后打印 `achieved_rps`）；**不是**模型官方文档里的「纯推理 QPS」，而是**经本服务转发的端到端**吞吐。 |

### 6.2 数据集

使用 JSON 文件：**数组**。元素可以是：

- 字符串：直接作为用户 `message`；
- 或对象：`{ "message": "..." }` / `{ "prompt": "..." }`。

压测时**每个请求随机抽取**一条组装请求体（与「多 prompt 混合负载」一致）。

示例：`backend/scripts/load/datasets/sample-chat-prompts.json`。

### 6.3 为何需要 `API_BEARER_TOKEN` 与 `CHAT_SESSION_ID`？

`loadtest:ttft` 调用真实 **`POST /api/chat/stream`**（不绕鉴权）：

1. **`Authorization: Bearer …`** → 解析出当前用户（JWT 的 `sub` 或明文 `users.id`），否则 **401**。  
2. **`session_id`** → 须为该用户名下会话，否则 **404**。  

下文「完整步骤」中给出如何取得这两项。

---

### 6.4 TTFT 压测：完整、可复现步骤（本地 Worker）

以下假定仓库已克隆，且在后端目录操作；**默认 API 基址** `http://127.0.0.1:8787`（`wrangler dev` 默认端口）。

#### 6.4.1 前置条件（逐项确认）

| 项 | 要求 |
|----|------|
| Node.js | 建议 ≥ 18（与 `backend/package.json` / README 一致） |
| 依赖 | 在 `backend/` 执行过 `npm install` |
| D1 迁移 | 已执行 `npm run db:apply:local` |
| 开发用户（推荐） | 已执行 `npm run db:seed:dev-user`，使 **`local-dev-user`** 与默认会话存在于**本地** D1 |
| LLM | `wrangler.toml` / `.dev.vars` 已配置当前提供方密钥，`GET /health/llm` 返回 `configured: true` |
| JWT | `JWT_SECRET` 已配置（本地 `wrangler.toml` [vars] 或 `.dev.vars`），否则 `POST /api/auth/login` 会 **503** |
| 可选 `jq` | 下面用 `jq -r` 解析 JSON；若无 `jq`，可用浏览器 DevTools / 复制粘贴响应手工取 `token` 与 `id` |

#### 6.4.2 步骤 1：启动 Worker（终端 A）

```bash
cd backend
npm run dev
```

保持该终端运行，直至压测结束。日志里应出现监听地址（一般为 `http://127.0.0.1:8787`）。

#### 6.4.3 步骤 2：健康检查（终端 B）

```bash
export API_BASE=http://127.0.0.1:8787
curl -sS "$API_BASE/health" | head -c 200
echo
curl -sS "$API_BASE/health/llm"
echo
```

期望：`/health` 返回 JSON；`/health/llm` 中 `configured` 为 `true`（否则流式对话会在业务层 **503**）。

#### 6.4.4 步骤 3：准备令牌 `API_BEARER_TOKEN`（二选一）

**路径 A — 种子用户（最快复现，需已 `db:seed:dev-user`）**

```bash
export API_BEARER_TOKEN='local-dev-user'
```

**路径 B — 登录拿 JWT（与真实前端一致）**

```bash
export API_BASE=http://127.0.0.1:8787
export API_BEARER_TOKEN="$(
  curl -sS -X POST "$API_BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"name":"loadtest-user"}' | jq -r .token
)"
echo "token length: ${#API_BEARER_TOKEN}"
```

若 `token` 为空：检查 `JWT_SECRET`、D1 是否可写、响应体是否为 JSON 错误。

#### 6.4.5 步骤 4：准备会话 `CHAT_SESSION_ID`（二选一）

**路径 A — 列出已有会话，取第一条 id**

```bash
curl -sS "$API_BASE/api/sessions" \
  -H "Authorization: Bearer $API_BEARER_TOKEN" | jq '.[0].id'
```

**路径 B — 新建会话**

```bash
export CHAT_SESSION_ID="$(
  curl -sS -X POST "$API_BASE/api/sessions" \
    -H "Authorization: Bearer $API_BEARER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' | jq -r .id
)"
echo "CHAT_SESSION_ID=$CHAT_SESSION_ID"
```

期望输出为 UUID 字符串。若 401：检查 `API_BEARER_TOKEN`；若 404 列表为空：用路径 B 创建。

#### 6.4.6 步骤 5（推荐）：curl 探活流式接口

确认 `session_id` 与令牌匹配，且 LLM 可用：

```bash
curl -sS -N --max-time 25 -X POST "$API_BASE/api/chat/stream" \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"只回复一个字：好\",\"session_id\":\"$CHAT_SESSION_ID\"}" | head -n 30
```

期望：数秒内出现 `event:` 行；若仅 JSON 错误体，先排除 401/404/503 再跑压测。

#### 6.4.7 步骤 6：执行 TTFT 压测

在仓库 **`backend/`** 目录执行（保证 `scripts/load/...` 相对路径正确；从仓库根目录则为 `cd backend`）：

```bash
cd backend

export API_BASE=http://127.0.0.1:8787
export API_BEARER_TOKEN='local-dev-user'   # 或与步骤 3 一致
export CHAT_SESSION_ID='<上一步得到的 UUID>'

# 保守起步（可按 6.6 节扫并发）
export TTFT_CONCURRENCY=3
export TTFT_TOTAL=15
export TTFT_READ_TIMEOUT_MS=120000
# 可选：自定义数据集（JSON 数组，见 6.2）
# export TTFT_DATASET=scripts/load/datasets/sample-chat-prompts.json

npm run loadtest:ttft
```

**退出码**：`0` 表示 **全部请求成功**；`2` 表示存在失败（仍会在 stdout 打摘要）；`1` 表示脚本异常（如缺环境变量、数据集读失败）。

#### 6.4.8 环境变量一览（`chat-stream-ttft.mjs`）

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `API_BEARER_TOKEN` | 是 | — | Bearer 令牌（JWT 或明文用户 id） |
| `CHAT_SESSION_ID` | 是 | — | 会话 UUID |
| `API_BASE` | 否 | `http://127.0.0.1:8787` | Worker 根 URL，无尾斜杠 |
| `TTFT_CONCURRENCY` | 否 | `3` | 并发 worker 数 |
| `TTFT_TOTAL` | 否 | `30` | 总请求数 |
| `TTFT_DATASET` | 否 | `scripts/load/datasets/sample-chat-prompts.json` | 相对 **当前工作目录**（一般为 `backend/`） |
| `TTFT_READ_TIMEOUT_MS` | 否 | `180000` | 单请求等待首 token 的最长时间（毫秒） |

---

### 6.5 压测输出解读（含范例）

#### 6.5.1 标准输出（stdout）

脚本打印**一行 JSON**（格式化缩进），字段含义如下：

| 字段 | 含义 |
|------|------|
| `api_base` | 实际请求的基址 |
| `dataset` | 使用的数据集**绝对路径**（脚本内 `path.resolve` 后） |
| `concurrency` | 并发 worker 数 |
| `total` | 完成的请求条数（应等于 `TTFT_TOTAL`） |
| `success` | 成功条数（观测到首个非空 `token` 内容） |
| `success_rate` | `success / total`，1 为 100% |
| `wall_clock_sec` | 从发起到全部 worker 结束的墙钟时间（秒） |
| `achieved_rps` | `total / wall_clock_sec`，端到端「请求/秒」（非纯模型 QPS） |
| `ttft_ms` | 仅对**成功**请求统计：首 token 延迟（毫秒）的 min / p50 / p95 / max |
| `note` | TTFT 定义说明（与 6.1 一致） |

**范例 A — 整体健康（虚构数值，结构同真实输出）**

```json
{
  "api_base": "http://127.0.0.1:8787",
  "dataset": "/Users/you/ai_bot/backend/scripts/load/datasets/sample-chat-prompts.json",
  "concurrency": 3,
  "total": 15,
  "success": 15,
  "success_rate": 1,
  "wall_clock_sec": 12.4,
  "achieved_rps": 1.21,
  "ttft_ms": {
    "min": 820,
    "p50": 1400,
    "p95": 2100,
    "max": 2600
  },
  "note": "TTFT 为首个含非空 content 的 SSE token 事件相对「发起 fetch」的耗时；含网络与本服务内意图/RAG/首包模型延迟。提前 abort 后不再统计整流时长。"
}
```

**如何读范例 A：**

- **成功率 100%**：鉴权、会话、LLM、SSE 在该并发与样本下均可用。  
- **`p50` ≈ 1.4s**：半数请求在约 1.4s 内看到首个可见回复字块；可作为「首字体验」参考。  
- **`p95` 明显高于 `p50`**：少数请求更慢，常见于模型排队、RAG/意图路径更重或网络抖动；若差距极大，可结合 `wrangler tail` 看是否工具调用多。  
- **`achieved_rps` ≈ 1.21**：在 3 并发、每请求读到首 token 即断开的情况下，整体约每秒完成 1.2 个「首 token 阶段」；**提高 `TTFT_CONCURRENCY` 可能提高该值，也可能因 429/超时而下降**。  

**范例 B — 部分失败（stdout 摘要 + stderr）**

stdout 可能类似：

```json
{
  "api_base": "http://127.0.0.1:8787",
  "dataset": ".../sample-chat-prompts.json",
  "concurrency": 12,
  "total": 40,
  "success": 28,
  "success_rate": 0.7,
  "wall_clock_sec": 18.2,
  "achieved_rps": 2.2,
  "ttft_ms": {
    "min": 900,
    "p50": 2500,
    "p95": 8900,
    "max": 11500
  },
  "note": "..."
}
```

stderr 可能出现：

```text
failure_breakdown: {"timeout_or_aborted":8,"http_503":4}
```

**如何读范例 B：**

- **`success_rate` 0.7**：12 路并发下已有 **30%** 未在超时内拿到首 token 或 HTTP 失败，说明当前环境**已超过舒适区**（模型限流、Worker 超时、或网络）。  
- **`failure_breakdown`**：  
  - `timeout_or_aborted` 多 → 增大 `TTFT_READ_TIMEOUT_MS` 或**降低并发**；若仍高，多为模型侧慢或队列。  
  - `http_503` → 常为 **LLM 未配置**或上游不可用；`http_401`/`http_404` → 令牌或 `session_id` 失效。  
  - `no_first_token_before_close` → 流提前结束且无有效 token，需对照 Worker 日志查是否报错中断。  
- **`ttft_ms` 仅基于成功样本**：失败请求**不计入**分位数；p95 很高时说明成功里仍有不少慢请求。

#### 6.5.2 与 k6 `api-smoke` / `loadtest:k6:stream` 的文档位置

- 短请求并发：`§1` 与 `npm run loadtest:k6`。  
- 等整段 SSE 结束：`§5.3` 与 `npm run loadtest:k6:stream`。  
- 首 token + 随机 prompt：`npm run loadtest:ttft`（本节）。

---

### 6.6 如何扫「能同时响应多少请求」

1. **固定** `TTFT_TOTAL`（如 100），**逐步提高** `TTFT_CONCURRENCY`（如 3 → 5 → 8 → 10…）。  
2. 每档记录 **stdout JSON** 与 **stderr `failure_breakdown`**，对比 **成功率** 与 **TTFT 分位数**。  
3. **同一 `CHAT_SESSION_ID`** 并发：主要压模型与单用户路径；多用户场景可扩展为多会话池（脚本外自行分配）。  

### 6.7 注意事项

- **费用与限额**：真实 LLM 按 token 计费；并发过高易触发 **RPM/TPM** 限制，结果依赖账号与地域。  
- **与 k6 VU 对比**：TTFT 脚本用 Node `fetch` + 流式解析，专为**首 token**设计；k6 默认更适合「整段响应」或短请求。  
- **工具调用**：若随机 prompt 经常触发 `search` 等工具，TTFT 会变大，分布会变宽；可按场景拆数据集（纯闲聊 / 强工具）。
