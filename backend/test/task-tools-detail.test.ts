import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry';
import { registerTaskTools } from '../src/tools/task-tools';
import type { TaskRepository } from '../src/db';

describe('task tools detail_json', () => {
  it('add_task stores detail_json', async () => {
    const inserted: { detail_json: string | null }[] = [];
    const tasks = {
      insert: vi.fn(async (row: { detail_json: string | null }) => {
        inserted.push({ detail_json: row.detail_json });
      }),
      findByIdForUser: vi.fn(async (id: string) => ({
        id,
        user_id: 'u1',
        project_id: null,
        title: 'T',
        description: null,
        detail_json: inserted[0]?.detail_json ?? null,
        status: 'pending',
        created_at: 0,
        updated_at: 0,
      })),
      listByUserId: vi.fn(),
      updateForUser: vi.fn(),
      deleteForUser: vi.fn(),
    } as unknown as TaskRepository;

    const reg = new ToolRegistry();
    registerTaskTools(reg, tasks);

    const calls = await reg.executeAll(
      [
        {
          id: 'c1',
          name: 'add_task',
          arguments: JSON.stringify({
            title: 'Parent',
            detail: { subtasks: [{ t: 'a' }] },
          }),
        },
      ],
      { userId: 'u1' },
    );
    const payload = JSON.parse(calls[0]!.output) as { ok: boolean; task?: { detail_json?: string | null } };
    expect(payload.ok).toBe(true);
    expect(inserted[0]?.detail_json).toContain('subtasks');
  });
});
