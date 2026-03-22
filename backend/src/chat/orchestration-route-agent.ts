/**
 * Route Plan Agent（阶段 4）：system 纪律与编排上下文（收窄 amap_* 由 ChatService 按轮次注入）。
 */
export function buildOrchestrationRouteAgentSystemBlock(stepId: string, stepSummary: string): string {
  const s = stepSummary.trim().slice(0, 200);
  return (
    `\n\n【编排 · Route Agent】路线子步骤（${stepId}）：${s}\n` +
    '- **工具**：仅使用 **amap_** 系列完成路线、POI、导航相关查询；答复中写明所用工具名（与路线模板、§7 一致）。\n' +
    '- **槽位（MVP）**：起点、终点、出行时间/日期、交通方式；信息不足时**在同一次对话流内**追问用户或结合上文再调 amap_*，勿空口编造路径。\n' +
    '- **顺序**：若同时存在任务子步，须在先完成任务写入并校验后再进入本路线专责轮（由系统控制工具暴露）。\n'
  );
}
