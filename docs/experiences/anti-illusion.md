# 工程级防幻觉（联网找图：假链、背诵图、主观「鉴定」）

本文记录在后端与前端为抑制**与工具事实不一致的幻觉**所做的措施，重心是：**图片嵌入 URL 必须可追溯到当次检索 JSON**，禁止模型背诵「新华社 / xinhuanet」等常见假链，并减少「逐条裁定是否实拍」等与 JSON 无关的话术。

与 **无理由拒答、拒调工具** 相关的强制调用、首轮 `tool_choice` 等，见同目录 [`anti-refusal.md`](./anti-refusal.md)。两篇互补：**拒答**解决「不调用 / 先长篇拒答」；**幻觉**解决「调用了仍编 URL 或瞎鉴定」。

---

## 1. 典型现象与根因

### 1.1 现象

- 工具已返回 `search(images)` 结果，正文中仍出现 **JSON 里不存在的** `![](https://www.xinhuanet.com/...)` 等固定形态链接。
- 工具 JSON **只有来源页 `link`**，没有可嵌入的直链字段，模型无法用 `![](…)` 合规满足提示，转而**编造**直链。
- 模型对每条结果写长篇「均非真实 2026 实拍」「均为 AI / 预告」等，依据的是**内在时间线**，而非工具返回字段。

### 1.2 根因归纳

| 根因 | 说明 |
|------|------|
| **数据形状** | Serper `images` 条目含 `imageUrl` / `thumbnailUrl` 等，若归一化时丢弃，模型侧只剩 `link`（网页），易触发编造。 |
| **提示无法 100% 约束** | 仅靠 system 禁止「自拟链接」，模型仍可能背诵训练语料中的「权威图」URL。 |
| **对齐策略** | 部分模型倾向「真实性说教」与「提供备选」，与「以 JSON 为界」冲突。 |

---

## 2. Serper 图片直链透传（`items[].image_url`）

**文件**：`backend/src/tools/search-tool.ts`  
**要点**：`normalizeMetaItems` + `pickImageUrl`，从 Serper 常见字段（`imageUrl`、`thumbnailUrl`、嵌套 `image` 等）归一成 **`items[].image_url`**，与 `link` / `title` 一并写入工具返回 JSON。

**效果**：模型在合规前提下**有**可用于 `![](url)` 的字符串；否则只能诚实描述「无私链」而非编链。  
**说明**：`extractSerperItemsForMeta` 仍见 `backend/src/serper/serper-client.ts`。

---

## 3. 系统提示：以工具 JSON 为界 + 禁止主观鉴定与转移话题

**文件**：

- `backend/src/chat/system-clock-block.ts`  
  - 第 4 条：`![](…)` 优先且原则上仅使用 **`items[].image_url`**；全无则陈述技术原因，禁止自编域名（点名示例降低背诵）。  
  - 第 5 条：**禁止**对检索结果做与 JSON 无关的「真实性 / 是否实拍」长篇鉴定；只能说清 **无 `image_url`、仅 `link`、条数为 0** 等。  
  - 第 6 条：用户查询中的公历年份、节日与**系统注入的当前日期**不冲突时，视为**正当检索主题**，禁止暗示「虚构时间线」。

- `backend/src/chat/chat-service.ts` — 常量 `WEB_IMAGE_FORCE_SYSTEM_APPEND`  
  - 强制先 `search(images)` 后作答（拒答侧见 anti-refusal）。  
  - **幻觉侧**：禁止用 `link` 冒充图片；禁止「备选 / 新华社 / xinhuanet / 文学想象 / 沉浸式描写」等转移话题；禁止营销式 bullet 推销无关服务。

---

## 4. 输出侧白名单：剔除未授权的 Markdown 图片

**问题**：流式阶段用户可能已看到模型生成的假 `![](…)`，且假链可能被写入会话库。

**文件**：

- `backend/src/chat/sanitize-web-search-images.ts`  
  - `parseSearchImagesAllowlistFromToolJson`：从当次 `search` 工具输出解析 `type === "images"` 且 `ok === true` 时的全部 **`items[].image_url`**；`ok !== true` 且仍为 images 语义时返回空数组（删光嵌入图）。  
  - `sanitizeMarkdownImagesToAllowlist`：正则匹配 `![alt](url)`，**删除** url 不在白名单内的整段。

- `backend/src/chat/chat-service.ts`  
  - 在 **`webImageSearchForceMode`** 下，每执行完一轮含 `search` 的工具后更新 **`webImageMarkdownAllowlist`**。  
  - 从 **第二轮及以后** 的模型回复轮次：若已有白名单状态，则**缓冲该轮全文**（不向客户端逐 token 推送），结束后对正文做清洗，再通过 SSE 下发 **`assistant_content`**（整段 `content` 替换当前助手气泡）。  
  - 持久化入库的 `finalText` 为**清洗后**文本。

- `frontend/src/hooks/useChatStream.ts`  
  - 处理 `event: assistant_content`，用 payload 的 `content` **替换**当前流式助手消息全文（与 `token` 追加语义区分）。

- `frontend/src/types/sse.ts`  
  - `SseEventName` 含 `assistant_content`。

**局限**：只处理 **Markdown 图片语法**；纯文字里的虚假宣传或无关段落仍依赖提示词与后续扩展（护栏模型、关键词规则等）。

---

## 5. 调试与手动对照 API

- **Prompt / 工具载荷**：`backend/src/chat/log-llm-messages.ts`（debug）。  
- **Serper vs SerpAPI、curl 样例**：[`docs/technical/image_search_api_curl.md`](../technical/image_search_api_curl.md)。

---

## 6. 验收建议（幻觉专项）

1. 配置 `SERPER_API_KEY`，触发联网找图句式，确认首轮有 `search` + `type: images`。  
2. 在日志或 debug 中确认工具 JSON 的 `items` 含 **`image_url`**（Serper 有直链时）。  
3. 故意让模型在文中插入非白名单 `![](https://example.com/x.jpg)`，保存后应**不存在**于最终展示与 DB（被剔除）。  
4. 不应再出现稳定形态的 **xinhuanet 背诵链**（除非恰好出现在当次 Serper 的 `image_url` 中，实践中极少）。

---

## 7. 工业界常见补充手段（与本文实现的关系）

| 手段 | 说明 |
|------|------|
| **输出结构化** | 强制 JSON schema，图片 URL 仅来自后端填写的数组，前端只渲染该数组。 |
| **护栏 / 二次模型** | 对完整回复做分类或改写，拦截「时间线阴谋论」、未授权域名等。 |
| **换主干模型** | 同样提示下，供应商与版本对「说教 / 备选」倾向差异大。 |
| **RLHF / DPO** | 用产品内标注数据压低假链与冗长拒鉴话术。 |
| **UI 只信服务端** | 聊天里不渲染任意 `![](http…)`，仅展示后端签发的图片组件。 |

当前仓库已落地的是 **白名单清洗 + SSE 整段替换 + Serper 字段透传 + 提示词约束**；其余为可选演进。

---

## 8. 与 `anti-refusal.md` 的分工

| 文档 | 主要覆盖 |
|------|----------|
| [`anti-refusal.md`](./anti-refusal.md) | 强制首轮调用 `search`、Serper 未启用时的诚实说明、`tool_choice: required`、与路线场景的互斥等。 |
| **本文** | 工具返回形态、`image_url`、正文里 Markdown 图的白名单、主观鉴定与转移话题的提示约束、前端 `assistant_content`。 |

---

## 9. 多轮跟进与质量指标（扩展阅读）

首轮成功后、用户「再要图 / 换图 / 链失效」等场景下的**工具未调用、伪 HTTP 验证、data URL、语气冒犯**等，见 [`web-image-followup-quality.md`](./web-image-followup-quality.md)。
