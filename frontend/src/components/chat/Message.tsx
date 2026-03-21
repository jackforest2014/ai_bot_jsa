import { useCallback, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import 'highlight.js/styles/github.css'

import RagCitation from '@/components/chat/RagCitation'
import ToolCallMark from '@/components/chat/ToolCallMark'
import type { ChatMessage, StreamMessageMeta } from '@/types/chat'
import { resolveCitation, resolveToolMeta, splitMessageSegments } from '@/lib/chat-message-segments'

type MarkdownVariant = 'user' | 'assistant'

function createMarkdownComponents(variant: MarkdownVariant): Components {
  const linkClass =
    variant === 'user'
      ? 'font-medium text-sky-300 underline decoration-sky-400/80 hover:text-sky-200'
      : 'font-medium text-sky-700 underline hover:text-sky-900'

  const inlineCodeClass =
    variant === 'user'
      ? 'rounded bg-white/15 px-1 py-0.5 text-[0.9em] text-slate-100'
      : 'rounded bg-slate-200/90 px-1 py-0.5 text-[0.9em] text-slate-900'

  return {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>
        {children}
      </a>
    ),
    p: ({ children }) => (
      <p className="my-2 text-sm leading-relaxed first:mt-0 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => <ul className="my-2 list-disc pl-5 text-sm">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal pl-5 text-sm">{children}</ol>,
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={
          variant === 'user'
            ? 'my-2 border-l-2 border-white/30 pl-3 text-sm text-slate-200'
            : 'my-2 border-l-2 border-slate-300 pl-3 text-sm text-slate-700'
        }
      >
        {children}
      </blockquote>
    ),
    h1: ({ children }) => (
      <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
    ),
    hr: () => (
      <hr className={variant === 'user' ? 'my-3 border-white/20' : 'my-3 border-slate-200'} />
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-800">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{children}</td>
    ),
    code({ className, children, ...props }) {
      const inline = Boolean((props as { inline?: boolean }).inline)
      if (inline) {
        return <code className={inlineCodeClass}>{children}</code>
      }
      return <code className={className}>{children}</code>
    },
    pre: ({ children }) => <PreWithCopy variant={variant}>{children}</PreWithCopy>,
  }
}

function PreWithCopy({ children, variant }: { children?: ReactNode; variant: MarkdownVariant }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    const text = preRef.current?.textContent ?? ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [])

  const preSurface =
    variant === 'user'
      ? 'border border-white/10 bg-slate-950/80 text-slate-100'
      : 'border border-slate-200 bg-white text-slate-900'

  return (
    <div className="group relative my-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        className="absolute right-2 top-2 z-10 rounded border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm opacity-0 transition hover:bg-slate-50 group-hover:opacity-100"
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre
        ref={preRef}
        className={`overflow-x-auto rounded-lg p-3 text-xs leading-relaxed ${preSurface}`}
      >
        {children}
      </pre>
    </div>
  )
}

function MarkdownChunk({ text, variant }: { text: string; variant: MarkdownVariant }) {
  const components = createMarkdownComponents(variant)
  return (
    <div className={variant === 'user' ? 'md-user' : 'md-assistant'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function renderAssistantSegments(content: string, streamMeta: ChatMessage['streamMeta']) {
  const segments = splitMessageSegments(content)
  let ragOrdinal = 0
  let toolOrdinal = 0

  return segments.map((seg, i) => {
    if (seg.kind === 'markdown') {
      if (!seg.text) return null
      return <MarkdownChunk key={i} text={seg.text} variant="assistant" />
    }
    if (seg.kind === 'rag') {
      const citation = resolveCitation(streamMeta, seg.attrs, ragOrdinal)
      ragOrdinal += 1
      return <RagCitation key={i} attrs={seg.attrs} fallbackInner={seg.inner} citation={citation} />
    }
    if (seg.kind === 'tool') {
      const toolMeta = resolveToolMeta(streamMeta, seg.attrs, toolOrdinal)
      toolOrdinal += 1
      return (
        <ToolCallMark key={i} attrs={seg.attrs} fallbackInner={seg.inner} toolMeta={toolMeta} />
      )
    }
    return null
  })
}

/** Serper 软限、降级等后端文案，在气泡内原样展示（任务 3.6 / §6.2.5） */
function collectBackendNotices(streamMeta?: StreamMessageMeta): string[] {
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

function renderUserBody(content: string) {
  const segments = splitMessageSegments(content)

  return segments.map((seg, i) => {
    if (seg.kind === 'markdown') {
      if (!seg.text) return null
      return <MarkdownChunk key={i} text={seg.text} variant="user" />
    }
    if (seg.kind === 'rag') {
      return (
        <RagCitation key={i} attrs={seg.attrs} fallbackInner={seg.inner} citation={undefined} />
      )
    }
    if (seg.kind === 'tool') {
      return (
        <ToolCallMark key={i} attrs={seg.attrs} fallbackInner={seg.inner} toolMeta={undefined} />
      )
    }
    return null
  })
}

export interface MessageProps {
  message: ChatMessage
  /** 助手消息流式失败时，重试其对应上一条用户问题（任务 3.6） */
  onRetry?: () => void
}

/** 用户 / AI 气泡、Markdown + 代码高亮与复制；`<rag>` / `<tool>` 与 SSE 元数据对齐；Serper 提示与重试（任务 3.2 / 3.6） */
export default function Message({ message, onRetry }: MessageProps) {
  const isUser = message.role === 'user'
  const bubble = isUser
    ? 'ml-8 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-sm'
    : 'mr-8 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm'

  const notices = !isUser ? collectBackendNotices(message.streamMeta) : []
  const hasAssistantText = !isUser && message.content.trim().length > 0
  const showAssistantPlaceholder = !isUser && !hasAssistantText && !message.streamFailed

  const body = isUser ? (
    renderUserBody(message.content)
  ) : (
    <>
      {notices.length > 0 ? (
        <div className="mb-2 space-y-1.5" role="status">
          {notices.map((text) => (
            <aside
              key={text}
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-950"
            >
              {text}
            </aside>
          ))}
        </div>
      ) : null}
      {message.streamFailed ? (
        <div
          className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900"
          role="alert"
        >
          <p className="font-medium">回复未完整生成</p>
          <p className="mt-0.5 whitespace-pre-wrap">{message.streamErrorMessage ?? '请重试'}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-50"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      {showAssistantPlaceholder ? (
        <span className="text-slate-400" aria-hidden>
          …
        </span>
      ) : null}
      {hasAssistantText ? renderAssistantSegments(message.content, message.streamMeta) : null}
    </>
  )

  return (
    <article className={bubble} aria-label={isUser ? '用户消息' : '助手消息'}>
      <div className="space-y-1">{body}</div>
    </article>
  )
}
