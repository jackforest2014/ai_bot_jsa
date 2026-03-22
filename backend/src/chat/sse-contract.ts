/**
 * POST /api/chat/stream 的 SSE 事件契约（阶段四 4.6，供前后端联调）。
 * 帧格式：`event: <name>\ndata: <json>\n\n`
 */
export const CHAT_SSE_EVENTS = [
  {
    event: 'status',
    description: '连接与阶段状态',
    payload_examples: [
      { phase: 'connected' },
      { phase: 'memory_retrieving' },
      { phase: 'memory_skipped', reason: 'string' },
      { phase: 'model_generating' },
      { phase: 'tools_running' },
    ],
  },
  {
    event: 'intention',
    description: '规则/分类器输出的意图',
    payload: { intention: 'string' },
  },
  {
    event: 'citation',
    description: 'RAG 命中，供前端悬停与 <rag> 对齐',
    payload: {
      kind: "'document' | 'conversation'",
      file_id: 'string | undefined',
      filename: 'string | undefined',
      semantic_type: 'string | undefined',
      excerpt: 'string',
      score: 'number | undefined',
    },
  },
  {
    event: 'token',
    description: '助手正文增量或兜底整段',
    payload: { content: 'string' },
  },
  {
    event: 'tool_call',
    description: '模型发起的工具调用',
    payload: { name: 'string', args: 'unknown' },
  },
  {
    event: 'tool_result_meta',
    description: '搜索等工具的结构化摘要（如有机结果条数）',
    payload: 'object（依工具而定）',
  },
  {
    event: 'done',
    description: '流正常结束',
    payload: {},
  },
  {
    event: 'orchestrator_plan',
    description: '多 Agent 编排：子步快照（tech_design §9.9.6.1）',
    payload: {
      correlation_id: 'string',
      schema_version: 1,
      steps: 'Array<{ id, type, title, status }>',
    },
  },
  {
    event: 'orchestrator_progress',
    description: '编排进度文案（高频）',
    payload: {
      correlation_id: 'string',
      schema_version: 1,
      phase: 'string',
      step_id: 'string | null（可选）',
      attempt: 'number（可选）',
      message: 'string',
      level: "'info' | 'warn' | 'error'（可选）",
    },
  },
] as const;

/** 编排模式下 token 可选扩展（§9.9.6.1） */
export type ChatTokenPayload = {
  content: string;
  source?: 'orchestrator' | 'task_agent' | 'route_agent';
};

/** done 可选扩展（§9.9.6.1） */
export type ChatDoneOrchestratorPayload = {
  orchestrator?: {
    correlation_id: string;
    outcome: 'success' | 'partial' | 'failed';
  };
};
