import type { StreamMessageMeta } from '@/types/chat'
import type { CitationPayload, ToolResultMetaPayload } from '@/types/sse'

export type MessageSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'rag'; attrs: Record<string, string>; inner: string }
  | { kind: 'tool'; attrs: Record<string, string>; inner: string }

interface RawTag {
  start: number
  end: number
  kind: 'rag' | 'tool'
  attrs: string
  inner: string
}

/** 解析 `key="v"` / `key='v'` / `key=v` 形式的属性串 */
export function parseXmlishAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {}
  const trimmed = attrStr.trim()
  if (!trimmed) return out
  const re = /([a-zA-Z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

function mergeNonOverlapping(sorted: RawTag[]): RawTag[] {
  const result: RawTag[] = []
  for (const t of sorted) {
    if (result.length === 0) {
      result.push(t)
      continue
    }
    const prev = result[result.length - 1]
    if (t.start < prev.end) continue
    result.push(t)
  }
  return result
}

function collectTags(content: string): RawTag[] {
  const out: RawTag[] = []
  const patterns: Array<{ kind: 'rag' | 'tool'; re: RegExp }> = [
    { kind: 'rag', re: /<rag(\s[^>]*)?>([\s\S]*?)<\/rag>/gi },
    { kind: 'tool', re: /<tool(\s[^>]*)?>([\s\S]*?)<\/tool>/gi },
  ]
  for (const { kind, re } of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        kind,
        attrs: (m[1] ?? '').trim(),
        inner: m[2] ?? '',
      })
    }
  }
  out.sort((a, b) => a.start - b.start)
  return mergeNonOverlapping(out)
}

/**
 * 将正文拆成 Markdown 段与 `<rag>` / `<tool>` 段，供 Message 分段渲染（技术方案 §6.2.1）。
 */
export function splitMessageSegments(content: string): MessageSegment[] {
  const tags = collectTags(content)
  const segments: MessageSegment[] = []
  let cursor = 0
  for (const t of tags) {
    if (t.start > cursor) {
      segments.push({ kind: 'markdown', text: content.slice(cursor, t.start) })
    }
    segments.push({
      kind: t.kind,
      attrs: parseXmlishAttrs(t.attrs),
      inner: t.inner.trim(),
    })
    cursor = t.end
  }
  if (cursor < content.length) {
    segments.push({ kind: 'markdown', text: content.slice(cursor) })
  }
  if (segments.length === 0) {
    segments.push({ kind: 'markdown', text: content })
  }
  return segments
}

/** 第 n 个 `<rag>` 优先匹配同序的 `citation`，或用 `file_id` / `index` 属性对齐 SSE（技术方案 §6.2.1） */
export function resolveCitation(
  meta: StreamMessageMeta | undefined,
  attrs: Record<string, string>,
  ordinal: number,
): CitationPayload | undefined {
  const list = meta?.citations ?? []
  if (list.length === 0) return undefined
  const fid = attrs.file_id
  if (fid) {
    const hit = list.find((c) => c.file_id === fid || String(c.file_id) === String(fid))
    if (hit) return hit
  }
  const idx = attrs.index !== undefined ? Number(attrs.index) : NaN
  if (!Number.isNaN(idx) && idx >= 0 && idx < list.length) return list[idx]
  if (ordinal >= 0 && ordinal < list.length) return list[ordinal]
  return undefined
}

/** 第 n 个 `<tool>` 与 `tool_result_meta` 按序或 `name` 对齐 */
export function resolveToolMeta(
  meta: StreamMessageMeta | undefined,
  attrs: Record<string, string>,
  ordinal: number,
): ToolResultMetaPayload | undefined {
  const list = meta?.toolResultMetas ?? []
  if (list.length === 0) return undefined
  const name = attrs.name ?? attrs.tool
  if (name) {
    const hit = list.find((t) => t.tool === name)
    if (hit) return hit
  }
  if (ordinal >= 0 && ordinal < list.length) return list[ordinal]
  return undefined
}
