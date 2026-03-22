/**
 * 编排 Task Agent：add_task → confirm 门禁与 not_found 重试计数（可单测）。
 */

export type TaskAgentGateState = {
  unconfirmedAddTaskId: string | null;
  confirmRetryCount: number;
};

export const TASK_AGENT_MAX_CONFIRM_RETRIES = 3;

export type TaskAgentReduceResult = {
  next: TaskAgentGateState;
  /** 本次因 not_found 触发了一次「可重试 add」计数（供 SSE / 埋点） */
  confirmNotFoundRetry?: boolean;
  /** 超过最大重试，应中止 ReAct 并给用户固定话术 */
  terminalMaxRetries?: true;
};

function parseObj(json: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readTaskIdFromAddOutput(out: Record<string, unknown>): string | null {
  if (out.ok !== true) return null;
  const task = out.task;
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
  const id = (task as Record<string, unknown>).id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * 在**顺序执行**完单步工具后更新门禁状态（与 ChatService 循环一致）。
 */
export function reduceTaskAgentGateAfterTool(
  state: TaskAgentGateState,
  call: { name: string; arguments: string },
  output: string,
): TaskAgentReduceResult {
  let unconfirmed = state.unconfirmedAddTaskId;
  let retries = state.confirmRetryCount;
  let confirmNotFoundRetry: boolean | undefined;

  if (call.name === 'add_task') {
    const j = parseObj(output);
    if (j) {
      const id = readTaskIdFromAddOutput(j);
      if (id) unconfirmed = id;
    }
    return { next: { unconfirmedAddTaskId: unconfirmed, confirmRetryCount: retries } };
  }

  if (call.name === 'confirm_tool_creation') {
    const args = parseObj(call.arguments) ?? {};
    const tid = typeof args.task_id === 'string' ? args.task_id.trim() : '';
    const j = parseObj(output);
    if (!tid || !j) {
      return { next: { unconfirmedAddTaskId: unconfirmed, confirmRetryCount: retries } };
    }
    if (j.ok === true) {
      if (unconfirmed && tid === unconfirmed) {
        unconfirmed = null;
      }
      return { next: { unconfirmedAddTaskId: unconfirmed, confirmRetryCount: retries } };
    }
    const reason = typeof j.reason === 'string' ? j.reason : '';
    if (reason === 'not_found' && unconfirmed && tid === unconfirmed) {
      confirmNotFoundRetry = true;
      retries += 1;
      unconfirmed = null;
    }
    /** 第 3 次 not_found 后中止（与「至多 3 次重试」一致） */
    const terminalMaxRetries = retries >= TASK_AGENT_MAX_CONFIRM_RETRIES ? true : undefined;
    return {
      next: { unconfirmedAddTaskId: unconfirmed, confirmRetryCount: retries },
      confirmNotFoundRetry,
      terminalMaxRetries,
    };
  }

  return { next: { unconfirmedAddTaskId: unconfirmed, confirmRetryCount: retries } };
}
