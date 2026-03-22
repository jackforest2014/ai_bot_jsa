import { sortChatMessagesByTimeline } from '@/lib/chat-message-order'
import type { ChatMessage } from '@/types/chat'

describe('sortChatMessagesByTimeline', () => {
  it('orders by createdAt then role when timestamps tie', () => {
    const msgs: ChatMessage[] = [
      { id: 'b-assist', role: 'assistant', content: 'b', createdAt: 100 },
      { id: 'a-user', role: 'user', content: 'a', createdAt: 100 },
      { id: 'c-user', role: 'user', content: 'c', createdAt: 99 },
    ]
    const sorted = sortChatMessagesByTimeline(msgs)
    expect(sorted.map((m) => m.id)).toEqual(['c-user', 'a-user', 'b-assist'])
  })
})
