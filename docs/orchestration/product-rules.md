# 多 Agent 编排 · 产品规则（阶段 0 冻结）

与 [技术方案 §9.9](../technical/tech_design_ai_bot_v1_2.md) 及 [任务列表](../tasks/tasks_backend_multi_agent_orchestration.md) 一致，供实现与验收对照。

## Orchestrator 何时触发（MVP）

- 由环境变量 **`ORCHESTRATION_ENABLED`** 控制（`true` / `1` 开启）。
- 开启后：**分解得到 `steps.length > 1`** 时走编排流水线；否则仍走现有 `ChatService`（见任务 2.4）。
- 分解失败或 `steps` 为空：走 **`fallback_single_chat`**（§9.9.10）。

## 子任务 2（路线）

- 子任务 1 **已成功**（含 `confirm_tool_creation` 通过）且分解含路线步时 **自动进入** Route Agent，**无需用户点确认**。

## 分解质量

- 第一版按 Prompt/规则实现；误判、漏判 **不阻塞上线**，靠埋点与后续迭代（§9.9.7）。

## 失败与重试

- **任务阶段最终失败**：不启动路线；向用户说明；用户可 **发新一条消息** 重试或换话题（同一会话内无强制冷却，由产品文案引导）。
- **`add_task` 重试**：**每次重试前**必须先 **`confirm_tool_creation`**（或等价读库）；若已存在对应行则 **禁止再次 `add_task`**（§9.9.4）。详见 [`add-task-retry-confirm.md`](../experiences/add-task-retry-confirm.md)。

## SSE 与埋点

- 事件与字段：**§9.9.6.1 / 9.9.6.2**；常量见 `backend/src/chat/sse-contract.ts` 中编排补充说明。
- 埋点名：见 `backend/src/orchestration/metric-names.ts`（实现编排服务时 `recordMetric` 引用）。

## 可选 GOT（阶段 5）

- **`TASK_AGENT_GOT_ENABLED`**：编排且进入 Task Agent 时，在首轮对话 LLM 前跑轻量 GOT，将简报追加到 system（**显著增加延迟与 token**）。
- **`ROUTE_AGENT_GOT_ENABLED`**：进入路线专责轮前同样注入 GOT 简报。
- 与 **`ENABLE_TOT_GOT_TOOLS`**（向模型注册 `graph_of_thoughts` 工具）**独立**；评测对比见任务单阶段 5.3，手测见 [`e2e-manual-checklist.md`](e2e-manual-checklist.md)。
