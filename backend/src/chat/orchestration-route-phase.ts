import type { ToolCall } from '../llm/types';
import type { ExecutedToolCall } from '../tools/tool-registry';

/**
 * 编排下「任务子步已成功」的粗粒度信号（§4.3）：confirm 落库、或 update/delete 成功。
 * 不含仅 add_task（须 confirm 后才可与 unconfirmed 门禁配合调度路线专责轮）。
 */
export function scanOrchestrationTaskPhaseGateSuccess(
  calls: readonly ToolCall[],
  executed: readonly Pick<ExecutedToolCall, 'output'>[],
): boolean {
  for (let i = 0; i < calls.length; i++) {
    const n = calls[i]!.name;
    if (n !== 'confirm_tool_creation' && n !== 'update_task' && n !== 'delete_task') continue;
    const out = executed[i]?.output ?? '';
    try {
      const j = JSON.parse(out) as { ok?: unknown };
      if (j.ok === true) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
