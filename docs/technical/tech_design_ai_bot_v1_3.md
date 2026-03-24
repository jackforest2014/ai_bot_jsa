# 后端技术设计方案（v1.3，下一阶段）

## 文档定位

| 属性 | 说明 |
|------|------|
| **与 v1.2 关系** | **[`tech_design_ai_bot_v1_2.md`](./tech_design_ai_bot_v1_2.md)** 描述**已对齐 PRD 的基线架构与实现主干**；**本文 v1.3** 承接其中**尚未完全落地**或**仅作框架/预留**的设计，并纳入 **GraphRAG 等新增规划**。 |
| **非目标** | 不复述 v1.2 已详述的整体架构、D1 表结构、SSE 契约、编排已落地部分等；需要时**回指 v1.2 章节**。 |
| **读者** | 架构师、后端负责人、算法/检索方向工程 |

## 文档版本

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-23 | AI Assistant | 初稿：整合 v1.2 未落地项 + GraphRAG 规划引用 + 分阶段路线 |
| 1.1 | 2026-03-23 | AI Assistant | §6 增补 **会话级轻量图**；§1 总表与 §10 分阶段对齐 `graphrag_integration_plan.md` **§9**（S0–S3） |

---

## 目录

- [1. 自 v1.2 迁移：未落地项总表](#1-自-v12-迁移未落地项总表)
- [2. LLM 输出评估与质量保障（承接 v1.2 §8.3）](#2-llm-输出评估与质量保障承接-v12-83)
- [3. Token 用量、成本模型与上报（承接 v1.2 §8.4）](#3-token-用量成本模型与上报承接-v12-84)
- [4. 上下文窗口精确预算（承接 v1.2 §8.2.3）](#4-上下文窗口精确预算承接-v12-823)
- [5. Agent 间通信 AgentBus（承接 v1.2 §9.9.8）](#5-agent-间通信-agentbus承接-v12-998)
- [6. 记忆与检索演进：GraphRAG、多路、Rerank](#6-记忆与检索演进graphrag多路rerank)
- [7. 深度研究与证据质量（关联任务清单）](#7-深度研究与证据质量关联任务清单)
- [8. 用户反馈、离线评估与提示词实验](#8-用户反馈离线评估与提示词实验)
- [9. 其他 v1.2 中的可选/远期能力](#9-其他-v12-中的可选远期能力)
- [10. v1.3 分阶段落地建议](#10-v13-分阶段落地建议)
- [11. 关联文档索引](#11-关联文档索引)

---

## 1. 自 v1.2 迁移：未落地项总表

以下条目在 **v1.2** 中已有设计描述，但**截至 v1.3 文档编写时**属于**未完整实现**、**仅部分实现**或**仍为预留**；本文 **§2–§9** 分主题展开，**§10** 给出落地顺序建议。

| v1.2 参考 | 主题 | v1.2 中的表述要点 | 当前实现概况（简述） | v1.3 承接章节 |
|-----------|------|-------------------|----------------------|---------------|
| **§8.3** | LLM 生成评估 | `validateResponse`、多层校验、可选 LLM-as-Judge、离线评估 | `ChatService` **无**统一 `validateResponse` 主路径；工具 JSON 错误依赖 ReAct 与 Registry 行为 | [§2](#2-llm-输出评估与质量保障承接-v12-83) |
| **§8.4** | Token 成本跟踪 | `pricing.ts`、`trackTokenUsage`、聚合告警 | Provider 已返回 `TokenUsage`，`recordMetric('llm_chat_stream')` 等**未**接通用成本模型与按用户聚合计费 | [§3](#3-token-用量成本模型与上报承接-v12-84) |
| **§8.2.3** | 上下文窗口管理 | `tiktoken` / `countTokens`、超窗丢弃策略 | 依赖模型大窗口 + **历史时间衰减**（`history-for-llm`）；**无**精确 token 预算主链路 | [§4](#4-上下文窗口精确预算承接-v12-823) |
| **§9.9.8** | AgentBus | 进程内 `AgentBus` / `AgentContext` 预留 | 编排仍以 **OrchestrationService + ChatService 参数注入** 为主；**无**独立 Bus 抽象 | [§5](#5-agent-间通信-agentbus承接-v12-998) |
| **§4.5 / 上传策略** | 图片 OCR | 图片可选 OCR 后再向量化 | 以产品/实现为准；若未启用则仍以非 OCR 路径为主 | [§9](#9-其他-v12-中的可选远期能力) |
| **§9.3 / 规划** | 深度研究结构化证据 | 子代理、报告质量 | 已有 `plan_research`；**结构化证据分层**等见专项任务清单 | [§7](#7-深度研究与证据质量关联任务清单) |
| **（新增）** | GraphRAG（文档级） | v1.2 未展开 | **未实现** | [§6](#6-记忆与检索演进graphrag多路rerank) + 专文 |
| **（新增）** | 会话级轻量图（Session Dialogue Graph） | v1.2 / v1.3 叙述性需求 | **未实现**；解决同会话「前文」结构化回忆，与 §3.7 案例相关 | [§6.3](#63-会话级轻量图与-graphrag-专文-9) |
| **（演讲/实现对照）** | RAG 多路、Rerank | v1.2 以单向量为主 | 单路 Qdrant；无 rerank | [§6](#6-记忆与检索演进graphrag多路rerank) |

> 说明：v1.2 中 **已落地** 的编排（§9.9）、事实检索 Search Agent（§9.1.1）、`confirm_tool_creation` 门禁等**不列入**上表。

---

## 2. LLM 输出评估与质量保障（承接 v1.2 §8.3）

### 2.1 目标

- 在**不破坏流式体验**的前提下，对 **tool_calls 参数**、**空响应**等做**可配置**校验；
- 可选启用 **LLM-as-Judge**（高可靠性模式，单独超时与预算）；
- **离线**：基于落库对话与 **`prompt_id`** 做质量分析，反哺模板与策略段（与 `docs/presentation/prompt_engineering.md` §8 一致）。

### 2.2 建议实现分层

| 层级 | 触发时机 | 行为 | 与 v1.2 关系 |
|------|----------|------|----------------|
| L1 语法 | 每轮 LLM 返回后 | `tool_calls[].arguments` JSON.parse；空 content+空 tools 告警或重试 | 对齐 v1.2 伪代码前两步 |
| L2 工具契约 | `ToolRegistry.execute` 前 | 可选 JSON Schema 校验（与 `parameters` 对齐） | v1.2「工具调用有效性」 |
| L3 语义 Judge | 最终文本前（可关） | 小模型/主模型二次调用打分 | v1.2「答案相关性」 |
| L4 离线 | 异步 Job | LLM-as-Judge 批处理、聚类失败原因 | v1.2 §8.3.3 |

### 2.3 工程约束

- **默认关闭 L3**，避免加倍延迟与费用；
- 失败策略：**记录 metric** → 可选 **用户无感重试 1 次** → 仍失败则保持现状（返回当前内容），避免无限循环。

---

## 3. Token 用量、成本模型与上报（承接 v1.2 §8.4）

### 3.1 现状与缺口

- **已有**：`GeminiProvider` / `QwenProvider` 从 API 解析 **`usage` → `TokenUsage`**；部分 metric 带 `text_chars` / 轮次等。
- **缺口**（v1.2 已规划但未成体系）：
  - 无独立 **`src/llm/pricing.ts`** 式 **模型价目表** 与 `calculateCost`；
  - 无 **`llm_usage` 级**、可按 **user_id / session / prompt_id** 聚合的**结构化持久化**（当前以日志 metric 为主）；
  - 无 **成本阈值告警** 流水线。

### 3.2 v1.3 目标架构（建议）

1. **`pricing.ts`**：`MODEL_PRICING` + `calculateCost(modelId, usage)`，支持环境变量覆盖单价（便于切换付费模型）。
2. **`ChatService` / 统一 LLM 包装层**：每次 `chatStream` 结束后异步 `recordMetric('llm_token_usage', { ...usage, estimated_cost })`（或写 D1 摘要表，按日聚合）。
3. **看板/脚本**：从 metric 或 D1 聚合；免费额度耗尽前 **告警**。

### 3.3 预期效果

- 切换 **Qwen/Gemini 付费档**时可快速评估 **单会话成本**；
- 为 **提示词优化 A/B**（见 §8）提供成本侧约束。

---

## 4. 上下文窗口精确预算（承接 v1.2 §8.2.3）

### 4.1 目标

在 **embedding / 主模型** 上下文上限收紧或 **system 膨胀** 时，避免 OOM 或截断不可控。

### 4.2 建议方案

- **计数**：优先使用 **供应商 `countTokens` API**（若可用）；否则 **Workers 友好** 的纯 JS 近似（或 WASM tiktoken，需评估包体积，对照 v1.2 §1.2.1）。
- **策略**（与 v1.2 一致）：保留 system + 最新 user；先压 **RAG 块** 与 **旧历史**；与现有 **`conversationRowsToLlmMessages` 时间衰减** 组合而非替代。

### 4.3 预期效果

- 可证明的 **P99 上下文长度**；便于 **GraphRAG** 注入社区摘要时的 **硬顶**。

---

## 5. Agent 间通信 AgentBus（承接 v1.2 §9.9.8）

### 5.1 目标

在 **单 Worker 进程内**，为多子 Agent（除当前「编排参数注入 ChatService」外）提供 **显式 handoff / 事件** 抽象，避免 `ChatService` 继续堆叠 if-else。

### 5.2 建议接口（与 v1.2 示意一致）

- **`AgentBus`**：`publish(topic, envelope)` / `subscribe` 或 **`handoff({ from, to, intent, payload })`**。
- **`envelope`**：`correlation_id`、`session_id`、`user_id`、**只读快照**（task_id、日历解析结果等），**禁止**子 Agent 直接共享可变单例。

### 5.3 落地节奏

- **Phase A**：仅 **TypeScript 类型 + 日志桩**，Orchestrator 仍同步调用；
- **Phase B**：并行分支（若产品需要）合并点经 Bus 汇聚状态。

### 5.4 权衡

- **收益**：扩展多 Agent 时边界清晰；
- **成本**：异步事件调试难，需配套 **trace id** 与 SSE 对齐。

---

## 6. 记忆与检索演进：GraphRAG、多路、Rerank

### 6.1 GraphRAG（文档级 / 知识库向）

- **专文**：[**`graphrag_integration_plan.md`**](./graphrag_integration_plan.md) **§1–§8、§11 小结**（实体—关系—社区、Local/Global/Hybrid、异步建图、D1+Qdrant 映射、分阶段 Phase 0–4）。
- **原则**：**不替换** 现有向量 chunk RAG；**降级为 vector_only** 与现有超时策略一致。

### 6.2 多路召回与 Rerank

- **现状与 rerank 规划**：[`docs/presentation/memory_architecture.md`](../presentation/memory_architecture.md) **§3.4、§3.5**。
- **v1.3 方向**：在 **GraphRAG Hybrid** 或 **BM25+向量** 后，统一 **rerank** 接口（可选交叉编码器），与 `MemoryService` 扩展点对齐。

### 6.3 会话级轻量图与 GraphRAG 专文 §9

针对 **「同一 `session_id` 内、如何更精准利用前面聊过的内容」**（与 `memory_architecture.md` **§3.7** 案例直接相关），v1.3 将 **会话级结构** 与 **文档级 GraphRAG** 区分规划：

| 维度 | 说明 |
|------|------|
| **专文章节** | **`graphrag_integration_plan.md` §9**（全文较长）：动机、每轮增量图命题、Workers **「内存图」误区**、**Durable Objects / D1+版本 / 队列** 等宿主对比、与 `ChatService` 注入位置、**节流与有界图**、**滚动摘要等轻量替代**、风险与测试、**S0–S3 子阶段** 与文档级 Phase 的并行关系。 |
| **与 6.1 关系** | **正交**：6.1 偏 **上传资料/用户知识库**；§9 偏 **对话轮次与会话内实体—关系**，二者可由统一 `MemoryService` 编排检索，但 **数据生命周期与构建节奏不同**。 |
| **实现硬约束** | 不可依赖 **无持久化的 Worker 全局 Map** 跨请求保留图；须 **DO、D1 乐观锁或队列物化**，并设 **会话图节点/边上限**。 |
| **产品默认** | 建议 **异步或节流 LLM 抽边**；同步路径至少保证 **滚动摘要** 可见，避免「图未建好则回忆全空」。 |

**落地顺序** 与 **§10** 中 **P5 并行轨「PS」** 一致，避免阻塞文档级 P5。

---

## 7. 深度研究与证据质量（关联任务清单）

- **任务文档**：[`docs/tasks/tasks_backend_research_quality_upgrade.md`](../tasks/tasks_backend_research_quality_upgrade.md)（证据结构化、来源分层、失败分类、与 `PlannerService` / `plan_research` 对齐）。
- **与 v1.2**：承接 **§9.3**「规划与子代理」中**质量与可追溯**的增强，而非替代现有规划主流程。

---

## 8. 用户反馈、离线评估与提示词实验

### 8.1 与 v1.2 §8.3.3 对齐

- 点赞/点踩（若产品提供）写入 D1，关联 **`conversation_id` / `prompt_id`**；
- 定期 **离线 Job**：工具失败率、空回复率、**按 scenario** 聚合。

### 8.2 与演讲材料对齐

- **提示词优化闭环**：[`docs/presentation/prompt_engineering.md`](../presentation/prompt_engineering.md) **§8**（版本实验、离线集、安全段不进 A/B）。

---

## 9. 其他 v1.2 中的可选/远期能力

| 项 | v1.2 位置 | v1.3 说明 |
|----|-----------|-----------|
| **图片 OCR 后向量化** | §4.5 上传与 RAG 策略 | 依赖第三方 OCR API 与合规评审；与 Graph 抽取可共用「富文本输入」管线 |
| **TOT/GOT** | §9.4、可选扩展 | 已实现为 **feature flag**；v1.3 不扩展，仅保持与成本/延迟监控一致 |
| **`projects` 深度产品化** | PRD 外 | 随产品优先级单独立项 |
| **MCP / 外部工具市场** | §1.2 叙事 | 架构预留，不在 v1.3 必做范围 |

---

## 10. v1.3 分阶段落地建议

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **P1** | Token 用量持久化 + `pricing.ts` + 基础告警 | 无 |
| **P2** | L1/L2 响应校验 + metric（不接 Judge） | P1 可选 |
| **P3** | 上下文 token 预算（API 计数 + 截断策略） | 无 |
| **P4** | 深度研究证据结构化（任务清单 PR-1 起） | 产品验收标准 |
| **P5** | GraphRAG **文档级** Phase 0–1（基线 + 实体） | 异步队列/Job |
| **P5′（PS）** | **会话级轻量图**（与 P5 **可并行**）：专文 **`graphrag_integration_plan.md` §9.11** 建议 **S0→S3**（滚动摘要 → Turn/实体图 → 读路径进 `ChatService` → 与文档 Local 统一编排） | DO 或 D1 版本列、可选 Queue；依赖产品对「跨轮回忆」优先级 |
| **P6** | AgentBus 类型与桩 → 逐步 handoff | 编排复杂度 |
| **P7** | Hybrid + rerank、GraphRAG **文档级** 后续阶段 + 与会话轨 **统一检索编排**（若 PS 已至 S3） | P5、P5′、presentation 设计 |

具体优先级可由 **产品 OKR** 与 **成本/延迟 SLO** 调整；**知识库向（P5）与会话向（P5′）** 不必严格串行。

---

## 11. 关联文档索引

| 文档 | 用途 |
|------|------|
| [`tech_design_ai_bot_v1_2.md`](./tech_design_ai_bot_v1_2.md) | 基线设计与已实现主干 |
| [`graphrag_integration_plan.md`](./graphrag_integration_plan.md) | GraphRAG：**§1–§8** 文档级；**§9** 会话级轻量图；**§10–§11** 参考与小结 |
| [`../presentation/memory_architecture.md`](../presentation/memory_architecture.md) | RAG 单路/多路/rerank 叙述 |
| [`../presentation/prompt_engineering.md`](../presentation/prompt_engineering.md) | 提示词与优化闭环 |
| [`../tasks/tasks_backend_research_quality_upgrade.md`](../tasks/tasks_backend_research_quality_upgrade.md) | 深度研究质量 |
| [`../tasks/tasks_backend_multi_agent_orchestration.md`](../tasks/tasks_backend_multi_agent_orchestration.md) | 编排任务拆解（与 v1.2 §9.9 对应） |
