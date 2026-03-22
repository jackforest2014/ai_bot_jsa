import { describe, it, expect } from 'vitest';
import { scanOrchestrationTaskPhaseGateSuccess } from '../src/chat/orchestration-route-phase';

describe('scanOrchestrationTaskPhaseGateSuccess', () => {
  it('is false for add_task only', () => {
    expect(
      scanOrchestrationTaskPhaseGateSuccess(
        [{ id: 'a', name: 'add_task', arguments: '{}' }],
        [{ output: '{"ok":true,"task":{"id":"t1"}}' }],
      ),
    ).toBe(false);
  });

  it('is true for confirm ok', () => {
    expect(
      scanOrchestrationTaskPhaseGateSuccess(
        [{ id: 'c', name: 'confirm_tool_creation', arguments: '{}' }],
        [{ output: '{"ok":true}' }],
      ),
    ).toBe(true);
  });

  it('is true for update_task ok', () => {
    expect(
      scanOrchestrationTaskPhaseGateSuccess(
        [{ id: 'u', name: 'update_task', arguments: '{}' }],
        [{ output: '{"ok":true}' }],
      ),
    ).toBe(true);
  });
});
