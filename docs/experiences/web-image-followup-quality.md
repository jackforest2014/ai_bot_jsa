# 联网找图：多轮跟进失效、工具命中率与体验回归

本文基于线上日志中**首轮找图成功、后续同主题多轮恶化**的案例，归纳问题类型、与 [`anti-refusal.md`](./anti-refusal.md)、[`anti-illusion.md`](./anti-illusion.md) 的关系，并给出**可观测指标**与工程/提示词对策。  
（注：本项目联网检索使用 **Serper**（`google.serper.dev`），不是 SerpAPI；下文「search 工具」均指 Worker 内注册的 Serper 封装。）

---

## 1. 日志中可观察到的现象序列（典型）

1. **首轮**命中 `webImageSearchForceMode`：`search(images)` 被强制调用，返回含 `image_url` 的 JSON，嵌入成功。  
2. **跟进句**如「再找两张」「换一张」「链接无效」等：`webImageSearchForceMode` 常为 **false**（历史实现中意图检测未覆盖部分跟进话术），工具列表为**全量**，模型 **`tool_calls: 0`** 仍长篇作答。  
3. 正文中出现 **不在当次工具 JSON 中的 URL**（xinhuanet、chinadaily、官网臆造路径、Flickr/Unsplash 伪造 ID）、或 **假 Base64 / 假 SVG** 的 `data:image/...`。  
4. 模型声称 **「已实测 HTTP 200」「隐身模式验证」**——在 Worker 未代发 HEAD/GET 的前提下，属**能力撒谎**。  
5. **工具类型误用**：用户要可嵌入图，模型调用 `search(organic)`，结果只有 `link`/`snippet`，却继续编造图片直链。  
6. **交付形态跑偏**：主推 PDF、建议用户下载 HTML、大段 emoji 营销列表，偏离「直接出图」。  
7. **冒犯性收尾**：如「你不需要再试了」，损害信任。

---

## 2. 问题归类

| 类别 | 表现 | 性质 |
|------|------|------|
| **工具未调用** | 用户仍要搜图/换图，但本轮无 `search` | 流程/意图检测缺口，非 Serper 故障 |
| **幻觉 URL** | 直链来自训练语料或臆造，与最近一次 `search(images)` JSON 不一致 | 与 anti-illusion 同类 |
| **伪验证叙事** | 「HTTP 200」「404 实测」「四重验证」 | 幻觉 + 过度自信话术 |
| **工具类型错** | `organic`/`news` 替代 `images` 却输出 `![](http…)` | 指令遵循失败 |
| **data: 内联图** | Base64/SVG 伪装成「截图」 | 绕过 http(s) 白名单与前端渲染习惯 |
| **范围蔓延** | PDF、HTML、本地文件、导航推销 | 任务漂移 / 模板式「增值服务」 |
| **语气问题** | 否定用户继续尝试 | 对齐与安全话术越界 |

---

## 3. 根因摘要

| 根因 | 说明 |
|------|------|
| **强制找图仅覆盖首轮句式** | `wantsWebImageSearch` 未识别部分跟进句时，不触发首轮收窄 + `tool_choice: required`，模型易「纯文本表演搜索」。 |
| **白名单清洗仅覆盖强制模式第二轮** | `assistant_content` 替换逻辑绑定 `webImageSearchForceMode`；跟进轮未命中时，假链不会被后端剔除。 |
| **模型无法真实访问 URL** | 任何「我打开过链接」的陈述在架构上不可信，除非后端增加探测工具或缓存探测结果。 |
| **检索索引滞后** | Serper 返回的 `image_url` 可能已失效；模型为「满足用户」继续编造看似合理的替代 URL。 |

---

## 4. 对策（工程 + 提示 + 产品）

### 4.1 已做或建议的工程改动

| 项 | 说明 |
|----|------|
| **扩大「联网找图」意图** | `detect-web-image-intent.ts`：在已提及图的前提下，识别「换一张 / 再找 / 多搜 / 没显示 / 无效链接 / 404」等跟进（避免无图场景的误触发）。 |
| **系统纪律** | `system-clock-block.ts` 第 7 条：禁止虚构 HTTP 实测、禁止 `data:image/` 冒充检索图、禁止「不必再试」类表述。 |
| **白名单** | 见 [`anti-illusion.md`](./anti-illusion.md)：强制场景下剔除非 `items[].image_url` 的 `![](…)`。可考虑将「跟进轮仍要求换图且用户明确要嵌入」也纳入窄工具 + 清洗（待产品定义）。 |
| **可选：服务端探活** | 对即将返回给前端的 `image_url` 做 Worker 侧 `HEAD`（超时、限流、仅 https），将 `ok: false` 或替换为下一条；**有成本与封禁风险**，需单独设计。 |

### 4.2 提示词（持续迭代）

- 明确：**不得**在正文中写「已验证链接可用」，除非工具返回里带有校验字段（当前无则一律不写）。  
- 用户要图：**必须**再调 `search`，`type: "images"`，**禁止**用 `organic` 结果编造图片 URL。  
- **禁止** Base64 图、**禁止**劝用户停止尝试；换图失败时应建议用户换关键词或接受「仅提供来源页 `link`」。

### 4.3 产品层

- 展示层：对 `![](https?://...)` 做代理或缓存（反防盗链、一致性）。  
- 失败时结构化展示：`[{ title, link, image_url, probe_status }]`，由 UI 渲染，减少模型自由发挥。

---

## 5. 质量与可观测指标（建议接入日志 / 分析）

以下指标用于后续检测回答质量与回归，可在现有 `analytics_metric` 上扩展字段或离线扫库。

### 5.1 工具与意图

| 指标 ID | 定义 | 用途 |
|---------|------|------|
| `web_image_intent_hit` | `wantsWebImageSearch(user_input) === true` 的请求占比或次数 | 意图检测是否覆盖真实需求 |
| `web_image_force_applied` | `webImageSearchForceMode === true` | 强制策略是否生效 |
| `search_called_in_turn` | 该 chat 请求内是否至少执行一次 `search` | **工具命中率**基线 |
| `search_images_called` | 是否执行 `type === 'images'` | 找图场景专用命中率 |
| `search_tool_miss_when_intent` | `web_image_intent_hit && !search_called_in_turn` | **核心回归信号**（你观察到的「没调 Serper」） |
| `search_organic_instead_of_images` | 同轮用户要嵌入图却出现 `search` 且 `type === 'organic'`（需从 tool_call 日志解析） | 工具类型误用 |

### 5.2 幻觉与合规

| 指标 ID | 定义 | 用途 |
|---------|------|------|
| `assistant_http_claim` | 助手正文含「HTTP 200」「实测」「隐身模式」等且当轮无探活工具 | 伪验证叙事频率 |
| `assistant_data_image_md` | 正文含 `![...](data:image/` | Base64 逃逸 |
| `markdown_img_count` | `![](` 出现次数 | 与 tool `image_url` 数量对比（离线） |
| `img_url_not_in_last_search_allowlist` | 最终正文中的 http(s) 图 URL 不在最近一条 `search(images)` 的 `items[].image_url` | 白名单外幻觉（强制模式应接近 0） |

### 5.3 体验与语气

| 指标 ID | 定义 | 用途 |
|---------|------|------|
| `dismissive_close_phrase` | 匹配「不必再试」「不要再试」「别试了」等 | 冒犯性收尾 |
| `off_scope_deliverable` | 强推 PDF 下载、HTML 文件、emoji 营销列表（可用简单关键词 + 长度阈值） | 任务漂移 |

### 5.4 聚合看板建议

- **找图会话成功率**：`search_images_called` 且最终用户未在后续轮抱怨「没显示」（需反馈通道或会话标签）。  
- **首轮 vs 跟进轮**：分别统计 `search_tool_miss_when_intent`，确认跟进是否修复。

---

## 6. 与现有文档的分工

| 文档 | 侧重 |
|------|------|
| [`anti-refusal.md`](./anti-refusal.md) | 首轮拒调、`tool_choice: required`、Serper 未启用说明 |
| [`anti-illusion.md`](./anti-illusion.md) | `image_url` 透传、白名单、`assistant_content`、主观鉴定 |
| **本文** | 多轮跟进、工具命中率、伪验证、data URL、语气与交付跑偏、**指标字典** |

---

## 7. 后续未决项（可选实现）

- 跟进轮同样启用「仅 `search` + 强制调用」或单独 `follow_up_web_image` 标志。  
- Worker 对 `image_url` 探活与结果写回 tool JSON。  
- 离线评估集：固定提示词 + 断言「必须含 tool_call search」。
