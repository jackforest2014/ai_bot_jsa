# 多 Agent 编排 · 直播式手测清单（阶段 6）

在 **`ORCHESTRATION_ENABLED=true`** 下对 `POST /api/chat/stream` 手测；可选对比 **`ORCHESTRATION_ENABLED=false`** 行为。高德 / Serper 按环境配置。

## 前置

- [ ] Worker 已配置 LLM、会话归属正常。
- [ ] 需路线用例时：`AMAP_WEB_KEY` 已配置。
- [ ] 日志或分析中可看到 `correlation_id`（编排请求级 UUID）。

## 用例

| # | 场景 | 输入示例（可改） | 期望 |
|---|------|------------------|------|
| 1 | 纯任务 | 「明天下午3点和张总电话会议，帮我记下来」 | 可走任务工具；单步时可能 `fallback_single_chat`；多步分解时首步 task 收窄工具。 |
| 2 | 纯路线 | 「从上海站到外滩怎么走」 | 首轮或路线专责轮仅 `amap_*`（若首步为 route）；SSE 含 `token` / `tool_call` / `done`。 |
| 3 | 复合 task→route | 「25号去苏州见客户，再查下高铁站怎么去酒店」 | `orchestrator_plan` 多步；先任务再路线专责轮；`orchestrator_progress` 含 `task_agent` / `route_agent`。 |
| 4 | 任务 confirm 重试 | 人为制造 confirm `not_found`（如断网后仅 add） | `orchestrator_progress` `task_agent` warn；至多 3 次后固定失败话术，**不再**进入路线专责轮。 |
| 5 | 重试成功 | 正常网络下 add → confirm ok | 侧栏任务刷新；若计划含 route，后续可出现路线专责轮。 |
| 6 | 编排关闭 | 同一句复合需求，`ORCHESTRATION_ENABLED` 关 | 无 `orchestrator_plan`，走常规 `ChatService`。 |

## GOT（可选，阶段 5）

- [ ] `TASK_AGENT_GOT_ENABLED=true`：多步且首步 task 时，首轮前多轮 LLM（延迟明显增加）；埋点 `orchestrator_got_task`。
- [ ] `ROUTE_AGENT_GOT_ENABLED=true`：进入路线专责轮前注入 GOT；埋点 `orchestrator_got_route`。

## 回归注意

- 未升级前端时：正文仍应主要来自 `token` 流。
- 与 [`product-rules.md`](product-rules.md)、[`tasks_backend_multi_agent_orchestration.md`](../tasks/tasks_backend_multi_agent_orchestration.md) 状态表对照。
