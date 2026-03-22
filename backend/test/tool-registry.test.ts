import { describe, it, expect, vi } from 'vitest';
import { inferToolInvocationOutcome, ToolRegistry } from '../src/tools/tool-registry';

describe('inferToolInvocationOutcome', () => {
  it('treats ok false as failure', () => {
    const o = inferToolInvocationOutcome(JSON.stringify({ ok: false, error: 'quota' }));
    expect(o.ok).toBe(false);
    expect(o.error_message).toBe('quota');
  });

  it('treats bare error string as failure', () => {
    const o = inferToolInvocationOutcome(JSON.stringify({ error: 'unknown_tool: x' }));
    expect(o.ok).toBe(false);
  });

  it('treats ok true as success', () => {
    expect(inferToolInvocationOutcome(JSON.stringify({ ok: true, items: [] })).ok).toBe(true);
  });
});

describe('ToolRegistry', () => {
  it('executes registered tool', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'echo',
      description: 'd',
      parametersSchema: { type: 'object', properties: { x: { type: 'string' } } },
      async execute(argsJson) {
        const o = JSON.parse(argsJson) as { x?: string };
        return { output: JSON.stringify({ ok: true, x: o.x }) };
      },
    });

    const out = await reg.executeAll(
      [{ id: '1', name: 'echo', arguments: JSON.stringify({ x: 'hi' }) }],
      { userId: 'u1' },
    );
    expect(out[0]?.output).toContain('hi');
  });

  it('returns error payload for unknown tool', async () => {
    const reg = new ToolRegistry();
    const out = await reg.executeAll(
      [{ id: '1', name: 'missing', arguments: '{}' }],
      { userId: 'u1' },
    );
    expect(out[0]?.output).toContain('unknown_tool');
  });

  it('calls persistInvocation when configured', async () => {
    const persist = vi.fn(async () => {});
    const reg = new ToolRegistry({ persistInvocation: persist });
    reg.register({
      name: 'fail_echo',
      description: 'd',
      parametersSchema: { type: 'object' },
      async execute() {
        return { output: JSON.stringify({ ok: false, error: 'nope' }) };
      },
    });
    await reg.executeAll(
      [{ id: '1', name: 'fail_echo', arguments: '{}' }],
      { userId: 'u1', sessionId: 's1' },
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        session_id: 's1',
        tool_name: 'fail_echo',
        ok: false,
        error_message: 'nope',
      }),
    );
  });
});
