import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry';
import { registerTaskTools } from '../src/tools/task-tools';
import type { TaskRepository, TaskRow } from '../src/db';

const baseRow = (id: string, title: string): TaskRow => ({
  id,
  user_id: 'u1',
  project_id: null,
  session_id: null,
  title,
  description: null,
  detail_json: null,
  status: 'pending',
  starts_at: null,
  ends_at: null,
  created_at: 1,
  updated_at: 1,
});

describe('confirm_tool_creation', () => {
  it('returns ok true when task exists for user', async () => {
    const tasks = {
      findByIdForUser: vi.fn(async (id: string) => (id === 'tid-1' ? baseRow('tid-1', '苏州会面') : undefined)),
      insert: vi.fn(),
      listByUserId: vi.fn(),
      updateForUser: vi.fn(),
      deleteForUser: vi.fn(),
    } as unknown as TaskRepository;

    const reg = new ToolRegistry();
    registerTaskTools(reg, tasks);

    const [res] = await reg.executeAll(
      [{ id: 'c1', name: 'confirm_tool_creation', arguments: JSON.stringify({ task_id: 'tid-1' }) }],
      { userId: 'u1' },
    );
    const p = JSON.parse(res!.output) as { ok: boolean; task?: { id: string }; reason?: string };
    expect(p.ok).toBe(true);
    expect(p.task?.id).toBe('tid-1');
    expect(res!.toolResultMeta?.tool).toBe('confirm_tool_creation');
  });

  it('returns not_found when missing or wrong user', async () => {
    const tasks = {
      findByIdForUser: vi.fn(async () => undefined),
      insert: vi.fn(),
      listByUserId: vi.fn(),
      updateForUser: vi.fn(),
      deleteForUser: vi.fn(),
    } as unknown as TaskRepository;

    const reg = new ToolRegistry();
    registerTaskTools(reg, tasks);

    const [res] = await reg.executeAll(
      [{ id: 'c1', name: 'confirm_tool_creation', arguments: JSON.stringify({ task_id: 'other' }) }],
      { userId: 'u1' },
    );
    const p = JSON.parse(res!.output) as { ok: boolean; reason?: string };
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('not_found');
  });

  it('returns title_mismatch when title_hint does not match', async () => {
    const tasks = {
      findByIdForUser: vi.fn(async () => baseRow('tid-1', '苏州会面')),
      insert: vi.fn(),
      listByUserId: vi.fn(),
      updateForUser: vi.fn(),
      deleteForUser: vi.fn(),
    } as unknown as TaskRepository;

    const reg = new ToolRegistry();
    registerTaskTools(reg, tasks);

    const [res] = await reg.executeAll(
      [
        {
          id: 'c1',
          name: 'confirm_tool_creation',
          arguments: JSON.stringify({ task_id: 'tid-1', title_hint: '完全不相关' }),
        },
      ],
      { userId: 'u1' },
    );
    const p = JSON.parse(res!.output) as { ok: boolean; reason?: string };
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('title_mismatch');
  });
});
