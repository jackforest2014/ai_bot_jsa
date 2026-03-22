import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/tools/tool-registry';

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
});
