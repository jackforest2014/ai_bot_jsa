import { useMemo } from 'react'

import type { ToolResultMetaPayload } from '@/types/sse'

function parseFallbackInner(inner: string): {
  query?: string
  rawLines: string[]
} {
  const trimmed = inner.trim()
  if (!trimmed) return { rawLines: [] }
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>
    const query = typeof j.query === 'string' ? j.query : undefined
    const items = Array.isArray(j.items) ? j.items : Array.isArray(j.results) ? j.results : null
    if (items && items.length > 0) {
      const rawLines = items.slice(0, 8).map((it, i) => {
        const o = it as Record<string, unknown>
        const title = String(o.title ?? o.url ?? `结果 ${i + 1}`)
        const url = typeof o.url === 'string' ? o.url : ''
        return url ? `${title} — ${url}` : title
      })
      return { query, rawLines }
    }
    return { query, rawLines: [trimmed.slice(0, 500)] }
  } catch {
    return { rawLines: [trimmed.slice(0, 500)] }
  }
}

export interface ToolCallMarkProps {
  /** 优先：SSE `tool_result_meta` */
  toolMeta?: ToolResultMetaPayload
  /** `<tool>` 标签内文，无 meta 时作降级解析（JSON 或原文） */
  fallbackInner?: string
  attrs?: Record<string, string>
}

/** 工具调用标记：悬停/聚焦展示结构化摘要（任务 3.3） */
export default function ToolCallMark({
  toolMeta,
  fallbackInner = '',
  attrs = {},
}: ToolCallMarkProps) {
  const name = toolMeta?.tool ?? attrs.name ?? attrs.tool ?? 'tool'
  const label = name === 'search' ? '搜索' : name

  const query = toolMeta?.query
  const rows = toolMeta?.items ?? toolMeta?.results ?? []

  const fallback = useMemo(
    () => (!toolMeta && fallbackInner ? parseFallbackInner(fallbackInner) : null),
    [toolMeta, fallbackInner],
  )

  const displayQuery = query ?? fallback?.query
  const listRows =
    rows.length > 0
      ? rows.slice(0, 10)
      : (fallback?.rawLines.map((line) => ({ title: line, url: undefined, snippet: undefined })) ??
        [])

  const hasBody =
    Boolean(displayQuery) ||
    listRows.length > 0 ||
    Boolean(toolMeta?.raw_ref) ||
    Boolean(fallback?.rawLines.length)

  return (
    <div className="group/tool relative z-0 inline-flex max-w-full align-baseline hover:z-30 focus-within:z-30">
      <button
        type="button"
        className="mx-0.5 inline-flex max-w-full cursor-pointer items-center rounded border border-cyan-500/40 bg-cyan-950/45 px-1.5 py-0.5 align-baseline text-xs font-medium text-cyan-100 outline-none ring-cyan-400/35 hover:border-cyan-400/55 hover:bg-cyan-950/65 focus-visible:ring-2"
        aria-haspopup="dialog"
        aria-label={`工具：${label}${displayQuery ? `，查询 ${displayQuery}` : ''}`}
      >
        <span className="truncate">🔧 {label}</span>
      </button>
      <div
        className="pointer-events-none invisible absolute left-0 top-full z-50 min-w-[12rem] max-w-[min(22rem,calc(100vw-2rem))] pt-1 group-hover/tool:pointer-events-auto group-hover/tool:visible group-focus-within/tool:pointer-events-auto group-focus-within/tool:visible"
        role="dialog"
        aria-label="工具结果详情"
      >
        <div className="pointer-events-auto max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-800 shadow-lg dark:border-slate-600/80 dark:bg-slate-950/95 dark:text-slate-200 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          {!hasBody ? (
            <p className="text-slate-500">暂无结构化摘要（等待 SSE 或正文解析）。</p>
          ) : null}
          {displayQuery ? (
            <p className="mb-2 font-medium text-slate-100">
              查询：<span className="font-normal text-slate-400">{displayQuery}</span>
            </p>
          ) : null}
          {toolMeta?.raw_ref ? (
            <p className="mb-2 break-all text-slate-400">
              <span className="font-medium text-slate-200">ref：</span>
              {String(toolMeta.raw_ref)}
            </p>
          ) : null}
          {listRows.length > 0 ? (
            <ul className="space-y-2">
              {listRows.map((item, i) => {
                const row = item as Record<string, unknown>
                const title = String(row.title ?? row.url ?? `结果 ${i + 1}`)
                const url = typeof row.url === 'string' ? row.url : undefined
                const snippet = typeof row.snippet === 'string' ? row.snippet : undefined
                const date = row.date
                return (
                  <li key={i} className="border-b border-slate-700/80 pb-2 last:border-0 last:pb-0">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-cyan-300 hover:underline"
                      >
                        {title}
                      </a>
                    ) : (
                      <span className="font-medium text-slate-100">{title}</span>
                    )}
                    {snippet ? (
                      <p className="mt-0.5 line-clamp-3 text-slate-400">{snippet}</p>
                    ) : null}
                    {date != null && date !== '' ? (
                      <p className="mt-0.5 text-[0.65rem] text-slate-500">{String(date)}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
