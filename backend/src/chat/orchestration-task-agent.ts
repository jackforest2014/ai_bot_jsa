/** 编排 Task Agent 首轮暴露的工具（须与 ToolRegistry 注册名一致） */
export const ORCHESTRATION_TASK_AGENT_TOOL_NAMES = [
  'resolve_shanghai_calendar',
  'add_task',
  'list_tasks',
  'update_task',
  'delete_task',
  'confirm_tool_creation',
] as const;

export function pickOrchestrationTaskAgentToolDefinitions<T extends { name: string }>(
  all: T[],
): T[] {
  return ORCHESTRATION_TASK_AGENT_TOOL_NAMES.map((n) => all.find((t) => t.name === n)).filter(
    (x): x is T => x != null,
  );
}

/** 与首轮 `tool_choice: required` + 收窄工具配套 */
export const ORCHESTRATION_TASK_AGENT_FORCE_FIRST_APPEND =
  '\n\n【编排 Task Agent · 首轮强制】API 首轮仅提供：resolve_shanghai_calendar、add_task、list_tasks、update_task、delete_task、confirm_tool_creation。你必须**先调用其中至少一个工具**（新建日程/待办须 `add_task`，改已有项用 `update_task`；`add_task` 成功后须再调 `confirm_tool_creation` 直至 `ok:true`）。禁止在未收到 confirm `ok:true` 前向用户断言任务已落库。\n';

export function buildOrchestrationTaskAgentSystemAppend(stepId: string, stepSummary: string): string {
  const s = stepSummary.trim().slice(0, 200);
  return (
    `\n\n【编排 · Task Agent】当前子步骤（${stepId}）：${s}\n` +
    '- `add_task` 成功返回 `task.id` 后，**必须**再调用 `confirm_tool_creation`；**只有** confirm 返回 `ok:true` 才可向用户说任务已写入。\n' +
    '- 若系统提示仍有「未确认的 add_task」，**禁止**再次 `add_task`，须先对上一轮返回的 `task.id` 调用 confirm。\n' +
    '- `confirm` 为 `not_found` 时可在核对参数后重试 `add_task`；同一请求内校验失败重试过多时系统将中止并不再进入后续路线步骤。\n'
  );
}
