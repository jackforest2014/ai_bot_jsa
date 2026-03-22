import type { ChatMessage } from '@/types/chat'

/** 同秒多消息时：user 先于 assistant，避免仅按 UUID 排序错乱（与后端成对写入一致） */
const ROLE_ORDER: Record<string, number> = {
  user: 0,
  assistant: 1,
  tool: 2,
  system: 3,
}

export function sortChatMessagesByTimeline(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const ta = a.createdAt ?? 0
    const tb = b.createdAt ?? 0
    if (ta !== tb) return ta - tb
    const ra = ROLE_ORDER[a.role] ?? 9
    const rb = ROLE_ORDER[b.role] ?? 9
    if (ra !== rb) return ra - rb
    return a.id.localeCompare(b.id)
  })
}
