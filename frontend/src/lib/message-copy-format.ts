import type { ChatMessage, StreamMessageMeta } from '@/types/chat'

import { splitMessageSegments } from '@/lib/chat-message-segments'

/** 与 Message 内原逻辑一致，供气泡与复制共用 */
export function collectBackendNotices(streamMeta?: StreamMessageMeta): string[] {
  const metas = streamMeta?.toolResultMetas
  if (!metas?.length) return []
  const raw: string[] = []
  for (const m of metas) {
    if (!m || typeof m !== 'object') continue
    if (typeof m.notice === 'string' && m.notice.trim()) raw.push(m.notice.trim())
    if (typeof m.quota_warning === 'string' && m.quota_warning.trim())
      raw.push(m.quota_warning.trim())
  }
  return [...new Set(raw)]
}

function timeLabel(createdAt: number | undefined): string | null {
  if (createdAt == null || !Number.isFinite(createdAt)) return null
  const ms = createdAt < 1e12 ? createdAt * 1000 : createdAt
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** 仅 Markdown 段拼接，不含 `<rag>` / `<tool>` 及对应 UI 注解 */
export function extractDialoguePlainText(content: string): string {
  const segs = splitMessageSegments(content)
  return segs
    .filter((s): s is { kind: 'markdown'; text: string } => s.kind === 'markdown')
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join('\n\n')
}

/** 角色、时间、完整正文、提示、流式失败、streamMeta 等，供「复制全部」 */
export function formatFullMessageForCopy(message: ChatMessage): string {
  const roleLabel =
    message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : message.role
  const lines: string[] = [`[${roleLabel}]`]
  const t = timeLabel(message.createdAt)
  if (t) lines.push(`时间: ${t}`)
  lines.push('---', message.content.trim() || '（无正文）')

  if (message.role === 'assistant') {
    const notices = collectBackendNotices(message.streamMeta)
    if (notices.length) {
      lines.push('---', '后端提示:')
      notices.forEach((n) => lines.push(`- ${n}`))
    }
    if (message.streamFailed) {
      lines.push('---', '流式状态: 失败')
      if (message.streamErrorMessage?.trim()) lines.push(message.streamErrorMessage.trim())
    }
    const meta = message.streamMeta
    if (meta?.citations?.length) {
      lines.push('---', '引用 (citations):')
      meta.citations.forEach((c, i) => {
        lines.push(`${i + 1}. ${JSON.stringify(c)}`)
      })
    }
    if (meta?.toolResultMetas?.length) {
      lines.push('---', '工具结果 (tool_result_meta):')
      meta.toolResultMetas.forEach((t, i) => {
        lines.push(`${i + 1}. ${JSON.stringify(t)}`)
      })
    }
    if (meta?.toolCalls?.length) {
      lines.push('---', '工具调用 (tool_calls):')
      meta.toolCalls.forEach((t, i) => {
        lines.push(`${i + 1}. ${JSON.stringify(t)}`)
      })
    }
  }

  return lines.join('\n')
}
