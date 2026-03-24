# 后端任务清单：深度研究链路质量增强（证据分层 + 回退标准化）

本文档承接技术方案 `tech_design_ai_bot_v1_2.md` 中 **§9.3（规划与子代理）**，给出一版可直接开工的增量实施清单。目标是：在不推翻现有 `plan_research` 架构的前提下，补齐“证据质量分层、结论可追溯、失败可分类”。

- 现状入口：`backend/src/tools/plan-research-tool.ts`
- 现状编排：`backend/src/planner/planner-service.ts`
- 现状搜索能力：`backend/src/tools/search-tool.ts`（含 Serper 配额治理）

---

## 范围与非目标

**范围（本清单会覆盖）**
- 研究结果从“纯文本拼接”升级为“结构化证据 + 文本报告”。
- 引入基础来源质量分层（规则打分）。
- 引入失败分类和统一回退文案。

**非目标（本轮不做）**
- 不引入新的外部搜索服务。
- 不改动前端页面结构（保持 `plan_research` 工具返回兼容）。
- 不上复杂统计学习模型，先用规则 + 少量 LLM 结构化输出。

---

## 迭代拆分（建议 3 个 PR）

## PR-1：证据结构化与基础质量分层（最小可上线）

### 1. 目标
在现有 `PlannerService` 中保留“拆子任务 -> 搜索 -> 汇总”主流程，但把中间产物从 `string` 升级为结构化对象，增加可观察与可评估能力。

### 2. 文件级改动

- **新增** `backend/src/planner/research-evidence.ts`
  - 定义证据结构、来源类型、规则打分。
- **修改** `backend/src/planner/planner-service.ts`
  - `SubAgent.execute` 返回结构化结果（兼容旧文本）。
  - `planAndExecute` 聚合结构化 section，再生成最终报告。
- **修改** `backend/src/tools/plan-research-tool.ts`
  - 保留 `ok + report` 字段。
  - 增加可选 `evidence_summary`（不破坏旧调用方）。
- **新增测试** `backend/test/planner-evidence.test.ts`

### 3. 建议新增类型（草稿）

```ts
// backend/src/planner/research-evidence.ts
export type SourceType =
  | 'government'
  | 'education'
  | 'news'
  | 'organization'
  | 'commercial'
  | 'community'
  | 'unknown';

export interface ResearchEvidenceItem {
  id: string;                 // e.g. ev_1
  title: string;
  url: string;
  domain: string;
  sourceType: SourceType;
  snippet: string;
  publishedAt?: string | null;
  reliabilityScore: number;   // 0 ~ 1
}

export interface ResearchSection {
  task: string;
  summary: string;
  evidences: ResearchEvidenceItem[];
}
```

### 4. 规则打分建议（先简单可解释）

- `government`：+0.35（`*.gov`, `*.gov.cn`）
- `education`：+0.25（`*.edu`, `*.edu.cn`）
- `news`：+0.20（白名单媒体域名，可配置）
- `organization`：+0.10
- `community`：-0.05（论坛/问答）
- `unknown`：0
- 片段长度过短（<30）再 -0.05
- 最终 clamp 到 `[0, 1]`

> 先保证“规则透明 + 可调参”，后续再引入模型判别。

### 5. `PlannerService` 改动要点（草稿）

```ts
// before: const results: string[]
const sections: ResearchSection[] = [];

for (const task of subTasks) {
  const sub = await subAgent.execute(task, ctx); // 改成结构化返回
  sections.push(sub);
}

const report = await this.summarize(trimmed, sections);
return {
  report,
  evidenceSummary: {
    sectionCount: sections.length,
    evidenceCount: sections.reduce((n, s) => n + s.evidences.length, 0),
  },
};
```

### 6. 单测建议（PR-1）

- `normalizeEvidenceItems`：空字段容错。
- `classifySourceType`：`gov/edu/news/community` 识别正确。
- `computeReliabilityScore`：边界值在 `[0,1]`。

---

## PR-2：结论-证据绑定 + 置信度（质量提升）

### 1. 目标
让最终报告中的每条关键结论都能追溯到证据列表，并显式标注置信度。

### 2. 文件级改动

- **新增** `backend/src/planner/research-claims.ts`
  - Claim 结构、JSON 校验、回退策略。
- **修改** `backend/src/planner/planner-service.ts`
  - 在 `summarize` 前新增 `buildClaimsWithEvidence`。
- **新增测试** `backend/test/planner-claims.test.ts`

### 3. 建议新增类型（草稿）

```ts
export type ClaimConfidence = 'high' | 'medium' | 'low';

export interface ResearchClaim {
  claim: string;
  evidenceIds: string[];
  confidence: ClaimConfidence;
  conflictNote?: string;
}
```

### 4. 判定规则建议（第一版）

- `high`：`evidenceIds >= 2` 且平均分 >= 0.65 且无明显冲突。
- `medium`：`evidenceIds >= 1` 且平均分 >= 0.45。
- `low`：其余情况，或存在冲突。

### 5. 报告格式建议

- 主要发现（按 claim 列出，带置信度）
- 证据依据（列 URL/标题）
- 冲突与不确定性
- 结论与下一步建议

---

## PR-3：失败回退标准化 + 埋点

### 1. 目标
将 `plan_research` 的失败从“笼统失败”升级为可分类、可统计、可前端识别。

### 2. 文件级改动

- **新增** `backend/src/planner/research-fallback.ts`
  - 错误码与文案映射。
- **修改** `backend/src/tools/plan-research-tool.ts`
  - `catch` 分层映射统一 code。
- **可选修改** `backend/src/observability/metrics.ts`
  - 增加研究链路指标名（若项目规范需要）。
- **新增测试** `backend/test/plan-research-fallback.test.ts`

### 3. 标准错误码（建议）

- `quota_exceeded`（Serper 配额）
- `provider_error`（搜索服务/网络异常）
- `insufficient_evidence`（证据不足）
- `conflicting_evidence`（证据冲突）
- `planner_internal_error`（内部未分类异常）

### 4. 工具返回格式（建议）

```json
{
  "ok": false,
  "code": "insufficient_evidence",
  "message": "本次检索证据不足，无法给出高置信度结论。",
  "hint": "请缩小问题范围，或限定地区/时间再试。"
}
```

---

## 与现有实现的对齐点

1. 继续复用 `search` 工具与 Serper 配额治理；不重复造轮子。  
2. 继续复用 `PlannerService` 主干，只增强中间表示与收尾策略。  
3. 对 `plan_research` 调用方保持兼容（`report` 仍存在），新增字段均为可选扩展。  

---

## 验收清单（可勾选）

### PR-1
- [ ] `plan_research` 仍返回 `ok + report`。
- [ ] 内部新增 evidence 结构，且有最小规则评分。
- [ ] 新增测试通过：`planner-evidence.test.ts`。

### PR-2
- [ ] 报告结论可追溯到 evidence ids。
- [ ] 每条 claim 有 `high/medium/low`。
- [ ] 新增测试通过：`planner-claims.test.ts`。

### PR-3
- [ ] 失败输出统一 code，不再只有 `plan_research_failed`。
- [ ] 日志/埋点可按失败码聚合。
- [ ] 新增测试通过：`plan-research-fallback.test.ts`。

---

## 风险与注意事项

- 规则打分不要过度拟合：先稳定、后精细。
- 结论绑定证据时，优先“宁可保守，不要幻觉自信”。
- 回退文案应可直接给用户看，避免暴露内部实现细节。

