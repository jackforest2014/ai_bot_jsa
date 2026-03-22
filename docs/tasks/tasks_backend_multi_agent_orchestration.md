# 后端任务列表：多 Agent 编排（Orchestrator + 专业 Agent）

本文档从 [后端技术方案 §9.9 `tech_design_ai_bot_v1_2.md`](../technical/tech_design_ai_bot_v1_2.md) 拆解实现任务，与现有 [`tasks_backend_v1_2.md`](tasks_backend_v1_2.md) **并行**：不改变其已完成阶段的验收，仅在新的编排能力上增量交付。

**依赖前提**：现有 `ChatService`、`ToolRegistry`、任务工具、高德系工具、SSE 管线可正常工作。

### 执行状态（滚动更新）

| 阶段 | 状态 | 说明 |
|------|------|------|
| **0 共识与契约** | ✅ 已完成 | [`docs/orchestration/product-rules.md`](../orchestration/product-rules.md)；`sse-contract` 增补 `orchestrator_*`；`ORCHESTRATION_METRICS`；经验文档 [`add-task-retry-confirm.md`](../experiences/add-task-retry-confirm.md) |
| **1 基础设施** | ✅ 已完成 | `confirm_tool_creation` 工具 + 单测；`TaskRepository.findByIdForUser` 已存在；`src/orchestration/agent-bus.ts`；`ORCHESTRATION_ENABLED` 环境变量占位 |
| **2 Orchestrator** | ✅ 已完成 | 分解 `decompose.ts`、`OrchestrationService`、`orchestrationSystemAppend` 接入 `ChatService`；`POST /api/chat/stream` 在 `ORCHESTRATION_ENABLED` 下走编排；单测 `orchestration-decompose`、`orchestration-service-stream` |
| **3 Task Agent** | ✅ 已完成（MVP） | 首步为 `task` 时 `orchestrationTaskAgent`：收窄首轮任务工具、confirm 门禁等（见上文） |
| **4 Route Plan Agent** | ✅ 已完成（MVP） | `orchestrationRouteAgent.planStepIndex`：首步 `route` 时首轮 **仅 amap_*** + `tool_choice: required` + `orchestrator_progress`（`route_agent`）+ `token.source=route_agent`；**task 先于 route** 时在 `confirm/update/delete` 成功且无未确认 add 后插入 **一轮** 路线专责轮；system 槽位纪律（§4.2 MVP）；埋点 `route_agent_start` / `route_agent_complete`；单测 `orchestration-route-phase` |
| **5 GOT（可选）** | ✅ 已完成（MVP） | `TASK_AGENT_GOT_ENABLED` / `ROUTE_AGENT_GOT_ENABLED`；`runGraphOfThoughtsLite`（[`graph-of-thoughts-lite.ts`](../../backend/src/lib/graph-of-thoughts-lite.ts)）与 `graph_of_thoughts` 工具共用；编排 Task 首轮前 / Route 专责轮前注入 system 简报；埋点 `orchestrator_got_task` / `orchestrator_got_route` |
| **6 回归与文档** | ✅ 已完成（MVP） | 手测清单 [`docs/orchestration/e2e-manual-checklist.md`](../orchestration/e2e-manual-checklist.md)；OpenAPI `POST /api/chat/stream` 说明编排 env；本文与 §9.9 / `product-rules` 互链见下 |

---

## 阶段 0：共识与契约（预计 4h）

### 任务 0.1：产品规则冻结（1h）
- 明确 **Orchestrator 何时触发**（仅复合意图 vs 可配置开关 vs 模型置信度阈值）。
- **子任务 2（路线）**：在 **子任务 1 已成功** 且分解结果包含路线步时 **自动进入**，**不要求用户点确认**（与技术方案 §9.9.5 一致）。
- **分解质量**：第一版按既定 Prompt/规则实现；**误判、漏判不阻塞上线**，留埋点与复盘节奏后续迭代（§9.9.7）。
- **失败话术** 与「任务阶段失败后是否仍允许同会话内用户主动重试」的边界。
- **重试**：**每次重试 `add_task` 前**必须先 `confirm_tool_creation`（或读库）以免重复插入（§9.9.4）。

### 任务 0.2：SSE 事件契约草案（2h）
- 列出新增事件名建议：`orchestrator_plan`（分解清单）、`agent_phase`（`orchestrator` | `task` | `route`）、`tool_result_meta` 扩展字段（若需）。
- **体感延迟**：实现 **§9.9.6.1** 的 **`orchestrator_plan` / `orchestrator_progress` 最小集合**（及 `status` / `token` / `done` 扩展）；与前端对齐展示策略（进度条、步骤条等）。TypeScript 形状见 **§9.9.6.2**。
- 与前端对齐 **最小可解析字段**（见前端任务单，可后补链接）。
- 向后兼容：未升级前端时，核心用户正文仍走现有 `token` 流。

### 任务 0.3：观测与埋点（1h）
- 为编排流水线增加 `analytics_metric` 名（示例）：`orchestrator_decompose`、`task_agent_round`、`confirm_task_retry`、`route_agent_start`。
- 日志中贯穿 `correlation_id`（单次用户消息级 UUID）。

---

## 阶段 1：基础设施（预计 8h）

### 任务 1.1：`confirm_tool_creation` 工具（3h）
- 新增工具实现：`task_id` 必填；校验 `user_id` 归属；返回 `{ ok, task?, reason? }`。
- 单元测试：存在 / 不存在 / 越权用户。
- 注册到 `ToolRegistry`；**默认不对最终用户暴露自然语言描述中的「内部工具名」**（与现有 system 纪律一致）。

### 任务 1.2：`TaskRepository` 读路径确认（1h）
- 确认 `getById(userId, taskId)`（或等价）已存在；若无则补 API，禁止子 Agent 绕过归属校验。

### 任务 1.3：AgentBus（进程内预留）（2h）
- 定义 `AgentEnvelope` 类型：`from`、`to`、`correlation_id`、`session_id`、`user_id`、`payload`（只读快照）。
- 提供 `NoOpAgentBus` 与 **工厂**（便于日后换队列实现）；Orchestrator v1 可直接函数调用，不强制经 Bus。
- 文档注释：**非分布式**、仅同 Worker。

### 任务 1.4：`add_task` 重试策略与幂等（2h）
- 文档化并实现：**confirm 失败** vs **add_task 抛错** 的分支。
- 可选：任务表扩展 `client_correlation_id`（或写入 `detail_json`）防重复插入 —— 若 PRD 不允许改表，则用「先 confirm 再决定是否二次 add」的纯逻辑方案。

---

## 阶段 2：Orchestrator（预计 12h）

### 任务 2.1：分解 Prompt + 结构化输出（4h）
- 输入：用户句 + 极简会话摘要（可选）。
- 输出 JSON schema（示例）：`{ "steps": [ { "type": "task", "summary": "..." }, { "type": "route", "summary": "..." } ] }`。
- **失败 / 空 steps / 无法解析**：必须走 **`fallback_single_chat`**，委托现有 `ChatService`（技术方案 **§9.9.10**）；发 `orchestrator_progress`（`phase: fallback_single_chat`）。

### 任务 2.2：`OrchestrationService` 骨架（4h）
- 新方法：`runStream(params)` 返回与现 SSE 兼容的 `ReadableStream`，或内部委托给统一 `send()`。
- 状态机：`IDLE → DECOMPOSE → TASK_AGENT → (ROUTE_AGENT | DONE)`。
- 单元测试：状态迁移与「任务失败则不进路线」。

### 任务 2.3：与用户可见文案（2h）
- 实现 §9.9.2 示例风格输出（可模板化）。
- 国际化：若产品仅中文，保留 TODO。

### 任务 2.4：接入 `POST /api/chat/stream`（2h）
- 分支条件：命中编排开关且分解结果 `steps.length > 1`（或产品定义）→ `OrchestrationService`；否则 **现有 `ChatService`**。
- Feature flag：`ORCHESTRATION_ENABLED`（vars / .dev.vars）。

---

## 阶段 3：Task Agent（预计 14h）

### 任务 3.1：专用 system prompt + 工具子集（3h）
- 工具：`resolve_shanghai_calendar`、`add_task`、`update_task`、`list_tasks`、`delete_task`（按需）、`confirm_tool_creation`。
- 明确纪律：**未经 `confirm_tool_creation.ok` 不得声称已创建**。

### 任务 3.2：强制调用策略（4h）
- 首轮收窄工具；对「新建」语义使用 **`tool_choice: required`** 且约束为 **必须出现 `add_task` 或 `update_task`**（实现方式：分轮暴露工具或与提供商能力对齐的等价手段）。
- 集成测试：给定用户句，断言至少一次 `add_task` tool_call（mock LLM 或录播）。

### 任务 3.3：confirm + 重试循环（4h）
- `add_task` 返回后 → `confirm_tool_creation`；不 ok 时 **下一次 `add_task` 之前再次 confirm**，若库中已有该行则 **禁止重复 add**（§9.9.4）。
- 失败重试至多 3 次；**每次重试意图**经 SSE 告知用户（与 §9.9.6 一致）。
- 最终失败：固定话术 + **不启动 Route Agent**。

### 任务 3.4：SSE `tool_result_meta` 与任务列表刷新（3h）
- 与现有前端约定对齐：确认成功后触发与现 `add_task` 一致的刷新信号。

---

## 阶段 4：Route Plan Agent（预计 10h）

### 任务 4.1：专用 prompt + `amap_*` 子集（3h）
- 复用 `route_query` 模板中的工具纪律（引用 §7 / 高德文档）。

### 任务 4.2：追问槽位填充（4h）
- 起点、终点、时间、交通方式；缺失则多轮对话（仍在同一次 SSE 或后续用户消息 —— **MVP 推荐**：同请求内多轮子 Agent ReAct，超长则拆用户回合）。

### 任务 4.3：仅任务成功后挂载（1h）
- Orchestrator 保证前置条件：`task_phase === success`。

### 任务 4.4：测试与配额（2h）
- 静态图配额、错误降级；埋点 `route_agent_complete`。

---

## 阶段 5：专业 Agent 内 GOT（可选，预计 10h+）

### 任务 5.1：Feature flag（1h）
- `TASK_AGENT_GOT_ENABLED` / `ROUTE_AGENT_GOT_ENABLED`。

### 任务 5.2：封装 GOT 子引擎（6h）
- 复用或扩展现有 `graph_of_thoughts` 工具逻辑为 **库级调用**（非必须经 LLM 再调工具）。
- 限制最大节点数/深度，防止 Workers CPU 时间触顶。

### 任务 5.3：对比评测（3h）
- 固定用例：无 GOT vs 有 GOT 的成功率与**客观耗时**（**成本与 token 优化不作为本阶段目标**，可仅记录埋点）。

---

## 阶段 6：回归与文档（预计 6h）

### 任务 6.1：E2E / 直播式手测清单（2h）
- 覆盖：纯任务、纯路线、复合、任务失败、重试成功、重试全败。

### 任务 6.2：更新 OpenAPI / 用户手册（2h）
- 若有新 query/header（仅 flag），记入 [`openapi.yaml`](../api/openapi.yaml) 与用户手册相关节。

### 任务 6.3：`tech_design` 与本文档互链校验（2h）
- 版本号、目录、实现状态勾选。

---

## 汇总

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| 0 | 契约与观测 | 4h |
| 1 | confirm、Bus 预留、幂等 | 8h |
| 2 | Orchestrator | 12h |
| 3 | Task Agent | 14h |
| 4 | Route Agent | 10h |
| 5 | GOT（可选） | 10h+ |
| 6 | 回归与文档 | 6h |
| **合计（含可选）** | | **约 64h+** |

---

## 参考

- [后端技术方案 v1.2 · §9.9](../technical/tech_design_ai_bot_v1_2.md#99-多-agent-编排orchestrator-与专业-agent演进)（含 §9.9.4 重试前 confirm、§9.9.5 路线自动衔接、**§9.9.6.1～6.2 SSE 字段契约与 TS 形状**）
- [任务工具强制经验](../experiences/task-mutation-tool-forcing.md)
- [编排产品规则](../orchestration/product-rules.md) · [直播式手测清单](../orchestration/e2e-manual-checklist.md) · 后端实现入口 [`backend/src/orchestration/`](../../backend/src/orchestration/)（含 `flags`、`got-flags`、`OrchestrationService`）
