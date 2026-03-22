# 工程级防拒答（联网找图：强制工具与工具诚实）

本文记录在后端对话链路中，为缓解模型**无理由拒答**、在具备能力时**拒不调用工具**、以及 **Serper 未启用时仍假装已搜索** 等问题所做的工程措施。  
「防拒答」在此特指：**在用户明确要求且系统具备能力时，优先走真实工具链，而不是纯文本策略性拒绝**；并非要求模型对任意请求永不拒绝。

**编造图片 URL、背诵假链、输出侧白名单清洗** 等属于 **防幻觉**，见同目录 [`anti-illusion.md`](./anti-illusion.md)。**多轮跟进仍要图却未调 search、工具命中率** 等见 [`web-image-followup-quality.md`](./web-image-followup-quality.md)。

---

## 1. 背景与典型故障

### 1.1 现象（拒答侧）

- 用户要求「帮我在网上找一张 … 图片并嵌入回答」，模型长篇解释「不能提供」「2026 尚未发生」「内容安全」等，且 **`tool_calls` 为 0**（未发起 `search`）。
- **Serper 未配置**时，工具列表里根本没有 `search`，模型仍按模板叙事「已搜索」，属**能力撒谎**（与幻觉交叉时详见 anti-illusion）。

### 1.2 两类根因（勿混为一谈）

| 类型 | 说明 |
|------|------|
| **A. 工具不可用** | Worker **未配置 `SERPER_API_KEY`** 时不会注册 `search` / `plan_research`，工具列表里无 `search`。须在 system 中显式降级，禁止假装已调用（见 §3）。 |
| **B. 模型策略拒答** | 即使具备搜索能力，仍可能用「知识截止」「事件未发生」等**拒调**或先输出大段拒答；或与**系统注入的当前时间**矛盾（如坚称仍是 2024 年）。属**指令遵循 / 对齐**问题，用 §2 时钟 + §4 强制工具有所缓解。 |

排查时先看日志 **`tool_calls`** 与 system 里 **工具列表 JSON** 是否含 `name: "search"`。

---

## 2. 系统时钟与工具纪律（全量对话）

**文件**：`backend/src/chat/system-clock-block.ts`  
**接入**：`backend/src/chat/chat-service.ts`（拼接在 **system 最前**）

- 注入**服务器当前时间**：Unix 秒、UTC ISO、`Asia/Shanghai` 人类可读时间。
- **东八区相对日速查**：从「明天」起连续 14 天的**公历 + 星期**（由 `buildShanghaiRelativeDayTable` 算出，见 `system-clock-block.ts`），避免模型把「后天」说成错星期、或列举任务时漏写某条日期。
- **判断「今天 / 当前年份 / 节日是否已过」只以上述为准**，禁止与系统时钟矛盾的「仍是 2024」等；用户陈述与系统日期一致时应采信。
- **条件化 search 义务**：**仅当**工具列表 JSON 中**实际存在** `search` 时，才对「上网找图」要求调用 `search` + `type: "images"`；**禁止**以「未来事件尚未发生」为由拒调（在具备 search 的前提下）。
- 与 **嵌入 URL 必须来自工具 JSON、禁止自拟链接** 相关的细化与 **主观「鉴定」检索结果** 的禁止，见 [`anti-illusion.md`](./anti-illusion.md)（系统内第 4–6 条与之衔接）。

---

## 3. Serper 未启用时的显式降级（防「假搜索」叙事）

**文件**：`backend/src/chat/chat-service.ts`  
**常量**：`SERPER_DISABLED_SYSTEM_APPEND`

当 `search` **未注册**时：

- 在 system 末尾追加：**模板里「调用 search」本请求无效**；禁止声称已调用 Serper、禁止编造检索得到的图片 URL。
- **`logger.info('chat stream: search tool not registered', …)`**，便于 `wrangler tail` 对齐。
- **`system_prompt_built` 的 debug** 中带 `serperSearchRegistered: false`。

**运维**：配置 `SERPER_API_KEY`（`.dev.vars` / `wrangler secret`），可用 `GET /health/serper` 自检。

---

## 4. 联网找图：首轮工程级防拒答（强制工具调用）

**问题**：已配置 Serper 时，模型仍可能在**首轮**输出大段拒答而不发起 `search`。

**文件**：

- `backend/src/chat/detect-web-image-intent.ts` — `wantsWebImageSearch(userInput)`  
- `backend/src/chat/chat-service.ts` — 与 `route_query` + 高德类似的**首轮收窄工具面 + 强制 function call**

**条件**（同时满足）：

- 已注册 `search`；
- `wantsWebImageSearch(userInput)` 为真（「图」+「网上 / 搜索 / 嵌入」等信号，避免泛泛提到「图片」就触发）；
- **非** `route_query` 且非首轮高德独占（避免与 `amap_*` 的 `tool_choice: required` 冲突）。

**行为**：

1. **首轮** `{{TOOLS_DEFINITIONS}}` 只注入 **`search`**。
2. **首轮 `chatStream`**：`toolChoice: 'required'`（OpenAI 兼容 / DashScope）。
3. **追加** `WEB_IMAGE_FORCE_SYSTEM_APPEND`：**第一步必须** `search`、`type` 为 `images`；禁止以「尚未发生」「伦理」等**拒调**；无结果须**先调用再说明**。

**Gemini**：`backend/src/llm/gemini-provider.ts` 在 `toolChoice === 'required'` 时将 `functionCallingConfig.mode` 设为 **`ANY`**（流式路径须生效）。

**日志**：`webImageSearchForceMode`、`webImageSearchForceFirstRound`（debug）。

**与防幻觉的衔接**：`WEB_IMAGE_FORCE_SYSTEM_APPEND` 后半段对 **URL 来源、禁止转移话题、禁止背诵备选图** 的约束，以及 **`image_url` 透传、正文白名单、`assistant_content`**，统一写在 [`anti-illusion.md`](./anti-illusion.md)。

**局限**：

- 仅覆盖检测到的「联网找图」句式。
- 第二轮起恢复全量工具；Serper 报错或配额用尽时的文字说明属合理边界。

---

## 5. 相关但独立：短期上下文时间衰减

**文件**：`backend/src/chat/history-for-llm.ts`  
按消息时间差做软截断 / 硬折叠，减轻旧话题占满窗口、干扰新话题（如找图）。属上下文工程，与防拒答间接相关。

---

## 6. 调试辅助：完整 prompt 日志

**文件**：`backend/src/chat/log-llm-messages.ts`  
`logger.debug` 输出即将发给 LLM 的 `messages`（`chat llm_message`），用于核对工具列表、是否命中找图强制、历史折叠等。

---

## 7. 验收建议（拒答专项）

1. 配置 `SERPER_API_KEY`，`GET /health/serper` 为已配置。  
2. 典型句：「帮我在网上找一张 … 图片，嵌入回答，不要只给链接」。  
3. 日志：`serperSearchRegistered: true`、`webImageSearchForceMode: true`、首轮 **`tool_calls > 0`** 且为 `search`。  
4. **未配置 Serper** 时：不得出现「已调用 search」叙事；应提示配置 key（见 §3）。  
5. **嵌入 URL 是否来自当次 JSON、假链是否被清洗**：见 [`anti-illusion.md` §6](./anti-illusion.md#6-验收建议幻觉专项)。

---

## 8. 后续可扩展方向（未实现）

- 更细意图（如「只搜新闻」）的**定向强制工具**与参数 schema。  
- 与 DashScope / Gemini **政策拒答**相关的上游开关，需结合供应商文档与合规单独评估。  
- ~~对 `![](http…)` 的白名单校验~~：**已实现**，见 [`anti-illusion.md` §4](./anti-illusion.md#4-输出侧白名单剔除未授权的-markdown-图片)。
