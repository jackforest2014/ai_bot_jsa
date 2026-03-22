/**
 * 识别「应强制走任务工具」的会话：规则关键词 + 与意图分类器协同（见 `resolveTaskMutationSignal`）。
 * 用于收窄任务域工具并 `tool_choice: required`，避免模型空口声称已创建任务却不调 add_task（含日历解析后的后续轮次，见 `mergeTaskMutationStateAfterExecute`）。
 */

/** 首轮暴露给模型的任务域工具（须与 ToolRegistry 注册名一致） */
export const TASK_MUTATION_TOOL_NAMES = [
  'resolve_shanghai_calendar',
  'add_task',
  'list_tasks',
  'update_task',
  'delete_task',
] as const;

export type TaskMutationToolName = (typeof TASK_MUTATION_TOOL_NAMES)[number];

/**
 * 这些意图与「任务写库」语义冲突，一律不套任务强制。
 * `route_query` 不在此列：纯路线仍独占高德；**同句含日程/会面等**时见 `taskMutationKeywordMatch` + `resolveTaskMutationSignal`。
 */
const BLOCK_TASK_FORCE_INTENTS = new Set([
  'research',
  'interview',
  'file_upload',
  'workspace_operation',
]);

/**
 * 在 `task_operation` 未命中时，用语义更窄的关键词补召回（时间/行程 + 具体动作）。
 * 避免与纯路线咨询混淆：不含「怎么走、导航、路线、公里」等单独触发。
 */
const KEYWORD_FORCE_PATTERNS: RegExp[] = [
  /(明天|后天|大后天|今儿|今日|下周|本周|这周|周[一二三四五六日天]|月|号|上午|下午|晚上|午间|\d{1,2}\s*[:：]\s*\d{1,2}).{0,48}?(电话|致电|打给|拨打|拜访|见面|约见|开会|会议|出差|去一趟|出发|返程|待两天|住.{0,3}晚)/,
  /(电话|致电|拜访|见面|开会|会议|出差|去一趟).{0,48}?(明天|后天|大后天|下周|本周|周[一二三四五六日天]|上午|下午|晚上|\d{1,2}\s*[:：]\s*\d{1,2})/,
  /(安排|预约).{0,20}(会议|会面|通话|拜访|行程|出差)/,
  /(订|预订).{0,12}(票|机票|高铁|酒店)/,
  /** 同句既有会面/地点又有路线/导航/规划，易被判 route_query；须仍走任务强制 */
  /(见面|会面|约见|开会|会议).{0,96}?(路线|导航|规划|怎么走|怎么去|行程)/,
  /(路线|导航|规划|怎么走|怎么去).{0,96}?(见面|会面|约见|开会|会议|拙政园|目的地)/,
];

export type TaskMutationSignalReason = 'intent_task_operation' | 'keyword' | 'none';

/** 用于 `routeAmapMode`：含日程/会面类线索时不得高德独占首轮，否则无法 `add_task`/`update_task`。 */
export function taskMutationKeywordMatch(userInput: string): boolean {
  const text = userInput.trim();
  if (!text) return false;
  return KEYWORD_FORCE_PATTERNS.some((p) => p.test(text));
}

export function resolveTaskMutationSignal(
  userInput: string,
  scenarioIntent: string,
): { force: boolean; reason: TaskMutationSignalReason } {
  const text = userInput.trim();
  if (!text || BLOCK_TASK_FORCE_INTENTS.has(scenarioIntent)) {
    return { force: false, reason: 'none' };
  }
  const keywordMatch = taskMutationKeywordMatch(userInput);
  if (scenarioIntent === 'route_query' && !keywordMatch) {
    return { force: false, reason: 'none' };
  }
  if (scenarioIntent === 'task_operation') {
    return { force: true, reason: 'intent_task_operation' };
  }
  if (keywordMatch) {
    return { force: true, reason: 'keyword' };
  }
  return { force: false, reason: 'none' };
}

export function pickTaskMutationToolDefinitions<T extends { name: string }>(
  all: T[],
): T[] {
  return TASK_MUTATION_TOOL_NAMES.map((n) => all.find((t) => t.name === n)).filter(
    (x): x is T => x != null,
  );
}

export type TaskMutationRoundState = { calendarPrimed: boolean; writeDone: boolean };

function parseToolOutputOk(output: string): boolean {
  try {
    const j = JSON.parse(output) as { ok?: unknown };
    return j.ok === true;
  } catch {
    return false;
  }
}

/**
 * 非编排路径：首轮 `resolve_shanghai_calendar` 成功后若立刻放开工具列表，模型常直接输出「已创建」而不调 `add_task`。
 * 在「日历已算准、但尚未写库」期间延续收窄 + `tool_choice:required`，直到 add/update/delete 任一成功。
 */
export function mergeTaskMutationStateAfterExecute(
  prev: TaskMutationRoundState,
  calls: ReadonlyArray<{ name: string }>,
  executed: ReadonlyArray<{ output: string } | undefined>,
): TaskMutationRoundState {
  let calendarPrimed = prev.calendarPrimed;
  let writeDone = prev.writeDone;
  for (let i = 0; i < calls.length; i++) {
    const name = calls[i]!.name;
    const out = executed[i]?.output ?? '';
    if (!parseToolOutputOk(out)) continue;
    if (name === 'resolve_shanghai_calendar') calendarPrimed = true;
    if (name === 'add_task' || name === 'update_task' || name === 'delete_task') writeDone = true;
  }
  return { calendarPrimed, writeDone };
}
