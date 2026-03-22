# 任务类请求：强制工具调用（经验记录）

## 问题归类

- **模型**：倾向用自然语言「假装已办妥」（如声称已创建任务），而不发起 `add_task`。
- **典型误判**：用户仅说日程（如「25号去苏州见师傅」）**未提路线**时，助手仍可能输出伪造 `任务ID`；根因是**该轮未成功走 `add_task`（或工具失败）**，与后续「规划路线」句是否为 `route_query` **无关**。应用 `ai.log` / `tool_invocations` 对照该请求的 `tool_execute` 与 `chat llm_message` 排查。
- **系统**：若写库唯一路径是工具/API，却未在协议层强制 function call，就会出现**叙述与数据库不一致**。

## 本仓库采取的措施（组合）

| 层级 | 做法 |
|------|------|
| **提示** | `TASK_MUTATION_SYSTEM_APPEND`：禁止未调用工具却声称已写入。 |
| **工具描述** | `add_task` 首句强调必须调用才会落库。 |
| **规则关键词** | `task-mutation-intent.ts` 中 `KEYWORD_FORCE_PATTERNS`：在意图未命中 `task_operation` 时，对「时间 + 动作（电话/拜访/会议/出差…）」等句式补召回。 |
| **轻量分类器** | `RuleBasedIntentClassifier`：`task_operation` 规则提前于 `greeting`，并扩展「明天…电话」等，避免「你好，我明天…」被判成纯问候。 |
| **工业界常见硬约束** | 满足条件时 **首轮仅暴露** `resolve_shanghai_calendar` + 任务四工具，`tool_choice: required`（Qwen/Gemini 均支持），迫使模型至少调用其一。 |
| **真相源** | 任务列表以 DB / `GET /api/tasks` 为准；工具成功时经 SSE `tool_result_meta` 刷新前端（既有逻辑）。 |

## 触发条件（`taskMutationForceMode`）

同时满足：

1. 非「高德独占首轮」、非联网找图独占首轮；  
   - **高德独占**仅当 `intention === 'route_query'` **且** `taskMutationKeywordMatch(userInput)` 为假。  
   - 同一句里既有「下午见面 / 去一趟」等又有「路线 / 规划 / 导航」时，分类器常判 `route_query`，过去会只开放 `amap_*`，模型只能**口头编造**任务 ID；现已通过关键词与 `routeAmapMode` 联动关闭独占，首轮强制任务工具后再进入全量工具做路线。
2. 注册表中能解析出完整任务工具子集；
3. `resolveTaskMutationSignal` 为真：  
   - `intention === 'task_operation'`，或  
   - 命中 `KEYWORD_FORCE_PATTERNS`（含「会面 + 路线/规划」等混合句式）。

以下意图**不**套任务强制（避免与检索/文件等冲突）：`research`、`interview`、`file_upload`、`workspace_operation`。  
**纯** `route_query`（仅问路、无日程/会面类线索）仍不强制任务工具，且仍可走高德独占首轮。

## 行为说明

- **首轮**：只能看到任务域工具 + 必须 function call；第二轮起恢复全量工具，以便在同一会话内继续搜索、高德等。
- **误触发**：用户仅闲聊但被强制时，模型可调用 `list_tasks` 等「无害」工具满足 required，再由第二轮纠正（成本可接受）。

## 相关代码

- `backend/src/chat/task-mutation-intent.ts` — 信号与工具名列表  
- `backend/src/chat/chat-service.ts` — `toolsForPrompt` / `roundDefs` / `streamOpts`  
- `backend/src/intent/intent-classifier.ts` — `task_operation` 规则顺序与模式  
- `backend/test/task-mutation-intent.test.ts`  

## 本地全量日志（`backend/ai.log`）

Worker 运行时**不能**可靠地向宿主机追加文件；因此用 **`npm run dev:log`**（`scripts/wrangler-dev-with-log.mjs`）包装 `wrangler dev`，把控制台 JSON 日志原样 **append** 到 **`backend/ai.log`**（已 `.gitignore`）。排查「声称已创建却未落库」时，在该文件中搜索对应 `session_id`、`add_task`、`tool_execute`。

## LLM 流式超时（相关现象）

- Qwen / Gemini 单次 `chatStream` 在 Worker 内使用 `AbortSignal.timeout` **整段墙钟**上限（当前各为 **300s**），与「多轮 ReAct + 长 system/历史」叠加时，原先 180s 易出现 `The operation was aborted due to timeout`，用户侧表现为整条对话流失败。  
- 若仍触顶，需从缩短历史注入、减少首轮 payload、或产品侧拆成多轮请求等方向优化。

## 后续可加强（未做）

- 专用小模型做二分类（当前为规则 + 正则）。  
- CI 评测集：固定用例断言「应出现 `add_task`」的召回率。  
- 用户显式确认后再写库（两阶段提交）。
