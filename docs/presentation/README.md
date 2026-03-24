# Presentation Docs 导航

本目录用于演讲、评审、面试答辩的“可直接讲”材料。

## 目录

- [主题文档](#主题文档)
- [使用建议](#使用建议)

---

## 主题文档

- `one_page_overview.md`  
  - 老板/非技术观众一页总览图 + 90 秒讲解词
- `intent.md`  
  - 意图识别主题（规则分类、策略联动、权衡、10/5/2 分钟讲稿）
- `multi_agent.md`  
  - 多 Agent 主题（编排器、task/route 专责、阶段门控、10/5/2 分钟讲稿）
- `architecture_overview.md`  
  - 跨主题 20 分钟总讲稿（tools/orchestration/memory/observability 串讲）
- `chat_service.md`  
  - ChatService 状态机、转移表、读图要点、Q&A、反质疑清单
- `context_engineering.md`  
  - 上下文工程：system/RAG/历史/工具面拼装，与记忆、工具、多 Agent、意图、可观测性的交界
- `prompt_engineering.md`  
  - 提示词工程：DB 模板与槽位渲染、代码内策略追加、管理 API，与意图/工具/上下文/编排的关系
- `tools_plugable.md`  
  - 工具系统可插拔、ToolRegistry 统一注册/执行、工具注入与策略
- `orchestration_light_multi_agent.md`  
  - 轻量多 Agent 编排（OrchestrationService、task/route 分流、阶段门控）
- `memory_architecture.md`  
  - 短期+长期记忆（D1 + Qdrant + RAG 引用；含多路召回、**rerank**、**GraphRAG 规划摘要**、**「昨天聊了什么」端到端案例 §3.7**）；完整技术规划见 `docs/technical/graphrag_integration_plan.md`
- `observability.md`  
  - 可观测性（SSE events + metrics）

## 维护（目录锚点）

修改各文档的 **`##` 章节标题**时，请同步更新文首 **`## 目录`** 中的链接文字与 `#` 锚点。  
仓库根目录提供自动校验（规则与 **GitHub** 标题 slug 一致）：

```bash
npm install
npm run check:presentation-toc
```

说明见 [`scripts/README.md`](../../scripts/README.md)。

## 使用建议

- 技术评审（10-15 分钟）：优先 `chat_service.md` + 对应主题文档
- 架构宣讲（20 分钟）：先讲 `architecture_overview.md`，再按听众兴趣深入单主题
- 业务汇报（1-3 分钟）：直接使用 `one_page_overview.md`
- 日常同步（5 分钟）：直接使用每份文档的“5 分钟讲稿”
- 面试快讲（2 分钟）：每份文档的“2 分钟讲稿” + `chat_service.md` 的反质疑清单
