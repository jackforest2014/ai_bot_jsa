import { describe, it, expect } from 'vitest';
import { encodeSseEvent } from '../src/chat/sse';

describe('encodeSseEvent', () => {
  it('formats SSE frame', () => {
    const line = encodeSseEvent('token', { content: 'a' });
    expect(line).toBe('event: token\ndata: {"content":"a"}\n\n');
  });
});
