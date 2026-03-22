import { describe, it, expect } from 'vitest';
import {
  reduceTaskAgentGateAfterTool,
  TASK_AGENT_MAX_CONFIRM_RETRIES,
  type TaskAgentGateState,
} from '../src/orchestration/task-agent-state';

describe('reduceTaskAgentGateAfterTool', () => {
  it('sets unconfirmed after successful add_task', () => {
    const s0: TaskAgentGateState = { unconfirmedAddTaskId: null, confirmRetryCount: 0 };
    const out = JSON.stringify({ ok: true, task: { id: 't1' } });
    const r = reduceTaskAgentGateAfterTool(s0, { name: 'add_task', arguments: '{}' }, out);
    expect(r.next.unconfirmedAddTaskId).toBe('t1');
    expect(r.next.confirmRetryCount).toBe(0);
  });

  it('clears unconfirmed on confirm ok', () => {
    const s0: TaskAgentGateState = { unconfirmedAddTaskId: 't1', confirmRetryCount: 0 };
    const out = JSON.stringify({ ok: true, task: { id: 't1' } });
    const r = reduceTaskAgentGateAfterTool(
      s0,
      { name: 'confirm_tool_creation', arguments: JSON.stringify({ task_id: 't1' }) },
      out,
    );
    expect(r.next.unconfirmedAddTaskId).toBeNull();
  });

  it('increments retries on not_found for pending id', () => {
    const s0: TaskAgentGateState = { unconfirmedAddTaskId: 't1', confirmRetryCount: 0 };
    const out = JSON.stringify({ ok: false, reason: 'not_found' });
    const r = reduceTaskAgentGateAfterTool(
      s0,
      { name: 'confirm_tool_creation', arguments: JSON.stringify({ task_id: 't1' }) },
      out,
    );
    expect(r.confirmNotFoundRetry).toBe(true);
    expect(r.next.confirmRetryCount).toBe(1);
    expect(r.next.unconfirmedAddTaskId).toBeNull();
    expect(r.terminalMaxRetries).toBeUndefined();
  });

  it('terminates after max confirm not_found retries', () => {
    let s: TaskAgentGateState = {
      unconfirmedAddTaskId: 't1',
      confirmRetryCount: TASK_AGENT_MAX_CONFIRM_RETRIES - 1,
    };
    const out = JSON.stringify({ ok: false, reason: 'not_found' });
    const r = reduceTaskAgentGateAfterTool(
      s,
      { name: 'confirm_tool_creation', arguments: JSON.stringify({ task_id: 't1' }) },
      out,
    );
    expect(r.next.confirmRetryCount).toBe(TASK_AGENT_MAX_CONFIRM_RETRIES);
    expect(r.terminalMaxRetries).toBe(true);
  });
});
