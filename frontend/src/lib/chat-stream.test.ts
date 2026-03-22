import { flushSseBuffer, parseSseBlock } from '@/lib/chat-stream'
import type { SseEvent } from '@/types/sse'

describe('parseSseBlock', () => {
  it('parses default event with JSON data', () => {
    const ev = parseSseBlock('data: {"a":1}\n')
    expect(ev).toEqual({ event: 'message', data: { a: 1 } })
  })

  it('parses named event and multiline data', () => {
    const ev = parseSseBlock('event: token\ndata: hello\n')
    expect(ev).toEqual({ event: 'token', data: 'hello' })
  })

  it('joins multiple data lines', () => {
    const ev = parseSseBlock('data: {"x":\ndata: 1}\n')
    expect(ev).toEqual({ event: 'message', data: { x: 1 } })
  })

  it('returns null when no data lines', () => {
    expect(parseSseBlock('event: ping\n')).toBeNull()
  })

  it('keeps raw string when JSON invalid', () => {
    const ev = parseSseBlock('data: not-json\n')
    expect(ev).toEqual({ event: 'message', data: 'not-json' })
  })
})

describe('flushSseBuffer', () => {
  it('emits complete blocks separated by blank line', () => {
    const events: SseEvent[] = []
    const { rest, consumed } = flushSseBuffer(
      'event: done\ndata: {}\n\nevent: token\ndata: "x"\n\nleft',
      (e) => events.push(e),
    )
    expect(consumed).toBe(true)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ event: 'done', data: {} })
    expect(events[1]).toEqual({ event: 'token', data: 'x' })
    expect(rest).toBe('left')
  })

  it('returns full buffer as rest when no delimiter', () => {
    const events: unknown[] = []
    const { rest, consumed } = flushSseBuffer('data: 1', () => {
      events.push(null)
    })
    expect(consumed).toBe(false)
    expect(events).toHaveLength(0)
    expect(rest).toBe('data: 1')
  })
})
