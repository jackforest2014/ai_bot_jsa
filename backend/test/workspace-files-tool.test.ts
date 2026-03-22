import { describe, it, expect, vi } from 'vitest';
import { createWorkspaceFilesTool } from '../src/tools/workspace-files-tool';
import type { FileService } from '../src/files/file-service';

describe('createWorkspaceFilesTool', () => {
  it('delegates list to FileService with userId', async () => {
    const handle = vi.fn(async (userId: string, args: Record<string, unknown>) => {
      expect(userId).toBe('u99');
      expect(args.action).toBe('list');
      return { ok: true, files: [] };
    });
    const fs = { handleToolAction: handle } as unknown as FileService;
    const tool = createWorkspaceFilesTool(fs);
    const r = await tool.execute(JSON.stringify({ action: 'list' }), { userId: 'u99' });
    const body = JSON.parse(r.output) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(handle).toHaveBeenCalledOnce();
  });
});
