import { useCallback, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import 'highlight.js/styles/night-owl.css'

import MessageCopyBar from '@/components/chat/MessageCopyBar'
import RagCitation from '@/components/chat/RagCitation'
import ToolCallMark from '@/components/chat/ToolCallMark'
import type { ChatMessage } from '@/types/chat'
import { collectBackendNotices } from '@/lib/message-copy-format'
import { resolveCitation, resolveToolMeta, splitMessageSegments } from '@/lib/chat-message-segments'

/** API 为 Unix 秒；流式本地消息为 `Date.now()` 毫秒 */
function messageTimeParts(createdAt: number | undefined): { iso: string; label: string } | null {
  if (createdAt == null || !Number.isFinite(createdAt)) return null
  const ms = createdAt < 1e12 ? createdAt * 1000 : createdAt
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const label = d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  return { iso: d.toISOString(), label }
}

type MarkdownVariant = 'user' | 'assistant'

function createMarkdownComponents(variant: MarkdownVariant): Components {
  const ast = variant === 'assistant'
  const linkClass =
    variant === 'user'
      ? 'font-medium text-sky-300 underline decoration-sky-400/80 hover:text-sky-200'
      : 'font-medium text-cyan-700 underline decoration-cyan-500/70 hover:text-cyan-900 dark:text-cyan-300 dark:decoration-cyan-400/70 dark:hover:text-cyan-200'

  const inlineCodeClass =
    variant === 'user'
      ? 'rounded bg-white/15 px-1 py-0.5 text-[0.9em] text-slate-100'
      : 'rounded bg-slate-200/90 px-1 py-0.5 text-[0.9em] text-slate-800 dark:bg-slate-800/95 dark:text-cyan-100'

  return {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>
        {children}
      </a>
    ),
    p: ({ children }) => (
      <p
        className={`my-2 text-sm leading-relaxed first:mt-0 last:mb-0 ${ast ? 'text-slate-700 dark:text-slate-200' : ''}`}
      >
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className={`my-2 list-disc pl-5 text-sm ${ast ? 'text-slate-700 dark:text-slate-200' : ''}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`my-2 list-decimal pl-5 text-sm ${ast ? 'text-slate-700 dark:text-slate-200' : ''}`}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={
          variant === 'user'
            ? 'my-2 border-l-2 border-white/30 pl-3 text-sm text-slate-200'
            : 'my-2 border-l-2 border-cyan-500/50 pl-3 text-sm text-slate-600 dark:border-cyan-500/35 dark:text-slate-300'
        }
      >
        {children}
      </blockquote>
    ),
    h1: ({ children }) => (
      <h1
        className={`mb-2 mt-3 text-base font-semibold first:mt-0 ${ast ? 'text-slate-900 dark:text-slate-100' : ''}`}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={`mb-2 mt-3 text-sm font-semibold first:mt-0 ${ast ? 'text-slate-900 dark:text-slate-100' : ''}`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`mb-1 mt-2 text-sm font-semibold first:mt-0 ${ast ? 'text-slate-900 dark:text-slate-100' : ''}`}
      >
        {children}
      </h3>
    ),
    hr: () => (
      <hr
        className={
          variant === 'user' ? 'my-3 border-white/20' : 'my-3 border-slate-300 dark:border-slate-600/80'
        }
      />
    ),
    table: ({ children }) => (
      <div
        className={
          ast
            ? 'my-2 overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-slate-600/80 dark:bg-slate-950/90'
            : 'my-2 overflow-x-auto rounded-md border border-slate-200 bg-white'
        }
      >
        <table className="w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className={ast ? 'bg-slate-100 dark:bg-slate-800/90' : 'bg-slate-100'}>{children}</thead>
    ),
    th: ({ children }) => (
      <th
        className={
          ast
            ? 'border border-slate-200 px-2 py-1.5 font-semibold text-slate-800 dark:border-slate-600 dark:text-slate-100'
            : 'border border-slate-200 px-2 py-1.5 font-semibold text-slate-800'
        }
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        className={
          ast
            ? 'border border-slate-200 px-2 py-1.5 text-slate-700 dark:border-slate-600 dark:text-slate-300'
            : 'border border-slate-200 px-2 py-1.5 text-slate-700'
        }
      >
        {children}
      </td>
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
      : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600/70 dark:bg-slate-950 dark:text-slate-100'

  const copyBtn =
    variant === 'user'
      ? 'border-slate-500/50 bg-slate-900/95 text-slate-200 hover:bg-slate-800'
      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-cyan-500/35 dark:bg-slate-900/95 dark:text-cyan-100 dark:hover:bg-slate-800'

  return (
    <div className="group relative my-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        className={`absolute right-2 top-2 z-10 rounded border px-2 py-1 text-xs font-medium shadow-sm opacity-0 transition group-hover:opacity-100 ${copyBtn}`}
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

function RegenerateIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

export interface MessageProps {
  message: ChatMessage
  /** 助手消息流式失败时，重试其对应上一条用户问题（任务 3.6） */
  onRetry?: () => void
  /** 下一条为助手时：清空该助手回复并重新请求（与气泡内失败重试同源） */
  onRegenerateReply?: () => void
  regenerateAssistantDisabled?: boolean
}

/** 用户 / AI 气泡、Markdown + 代码高亮与复制；`<rag>` / `<tool>` 与 SSE 元数据对齐；Serper 提示与重试（任务 3.2 / 3.6） */
export default function Message({
  message,
  onRetry,
  onRegenerateReply,
  regenerateAssistantDisabled = false,
}: MessageProps) {
  const isUser = message.role === 'user'
  const bubble = isUser
    ? 'max-w-[min(92%,42rem)] rounded-xl border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-900 to-teal-950 px-3 py-2 text-sm text-white shadow-[0_4px_24px_rgba(34,211,238,0.22)]'
    : 'max-w-[min(92%,42rem)] rounded-xl border border-violet-300/70 bg-gradient-to-br from-slate-50 via-white to-violet-50/60 px-3 py-2 text-sm text-slate-800 shadow-md dark:border-violet-500/35 dark:from-slate-800 dark:via-slate-900 dark:to-zinc-950 dark:text-slate-100 dark:shadow-[0_8px_28px_rgba(0,0,0,0.45)]'

  const timeParts = messageTimeParts(message.createdAt)
  const timeClass = isUser
    ? 'text-[10px] tabular-nums text-cyan-200/55'
    : 'text-[10px] tabular-nums text-slate-500 dark:text-slate-500'

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
              className="rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-100"
            >
              {text}
            </aside>
          ))}
        </div>
      ) : null}
      {message.streamFailed ? (
        <div
          className="mb-2 rounded-md border border-red-300/80 bg-red-50 px-2.5 py-1.5 text-xs text-red-900 dark:border-red-500/40 dark:bg-red-950/45 dark:text-red-100"
          role="alert"
        >
          <p className="font-medium">回复未完整生成</p>
          <p className="mt-0.5 whitespace-pre-wrap text-red-800 dark:text-red-200/90">
            {message.streamErrorMessage ?? '请重试'}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded border border-red-400/60 bg-red-100 px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-200/80 dark:border-red-400/40 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-900/50"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      {showAssistantPlaceholder ? (
        <span className="text-slate-400 dark:text-slate-500" aria-hidden>
          …
        </span>
      ) : null}
      {hasAssistantText ? renderAssistantSegments(message.content, message.streamMeta) : null}
    </>
  )

  return (
    <div
      className={`flex w-full flex-col gap-1 ${isUser ? 'items-end pl-8' : 'items-start pr-8'}`}
    >
      <article className={bubble} aria-label={isUser ? '用户消息' : '助手消息'}>
        <div className="space-y-1">{body}</div>
      </article>
      <div
        className={`flex max-w-[min(92%,42rem)] items-center gap-1.5 px-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        {!isUser ? (
          <MessageCopyBar message={message} menuAlign="left" mutedClass={timeClass} />
        ) : null}
        {timeParts ? (
          <time className={`shrink-0 tabular-nums ${timeClass}`} dateTime={timeParts.iso}>
            {timeParts.label}
          </time>
        ) : null}
        {isUser ? (
          <div className={`inline-flex shrink-0 items-center gap-0.5 ${timeClass}`}>
            <MessageCopyBar message={message} menuAlign="right" mutedClass="" />
            {onRegenerateReply ? (
              <button
                type="button"
                title="重新生成回复"
                aria-label="重新生成下一条 AI 回复"
                disabled={regenerateAssistantDisabled}
                onClick={onRegenerateReply}
                className="rounded p-0.5 text-current opacity-70 hover:bg-white/15 hover:opacity-100 disabled:pointer-events-none disabled:opacity-35"
              >
                <RegenerateIcon />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
