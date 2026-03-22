import { type KeyboardEvent, useCallback, useId } from 'react'

export interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  /** 提交当前输入（非空）；父组件通常在此调用 `useChatStream` 的 `send` 并清空 `value` */
  onSend: (text: string) => void
  /** 流式进行中：禁用输入区并展示思考态；配合 `onAbort` 可中止 */
  isStreaming?: boolean
  onAbort?: () => void
  placeholder?: string
  disabled?: boolean
}

/**
 * 多行输入：Enter 发送、Shift+Enter 换行；流式中禁用与思考动画；可中止进行中的请求（与 `useChatStream` 协作）。
 */
export default function ChatInput({
  value,
  onChange,
  onSend,
  isStreaming = false,
  onAbort,
  placeholder = '输入消息…',
  disabled = false,
}: ChatInputProps) {
  const busyId = useId()
  const inputDisabled = disabled || isStreaming

  const submit = useCallback(() => {
    if (inputDisabled || isStreaming) return
    const t = value.trim()
    if (!t) return
    onSend(t)
  }, [inputDisabled, isStreaming, onSend, value])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return
    e.preventDefault()
    submit()
  }

  return (
    <div className="relative rounded-lg border border-cyan-500/25 bg-slate-950/60 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      {isStreaming ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-cyan-400/35 animate-pulse"
          aria-hidden
        />
      ) : null}
      <div className="flex flex-col gap-2 p-2">
        <label htmlFor={busyId} className="sr-only">
          对话输入
        </label>
        <textarea
          id={busyId}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={inputDisabled}
          aria-busy={isStreaming}
          className="min-h-[5.5rem] w-full resize-y rounded-md border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {isStreaming ? (
          <div className="flex items-center gap-2 px-1 text-xs text-cyan-300/90" aria-live="polite">
            <span className="inline-flex gap-0.5" aria-hidden>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" />
            </span>
            <span>正在生成回复…</span>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          {isStreaming && onAbort ? (
            <button
              type="button"
              onClick={() => onAbort()}
              className="rounded-md border border-amber-500/40 bg-amber-950/50 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
            >
              停止
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={inputDisabled || !value.trim()}
            className="rounded-md border border-cyan-500/40 bg-gradient-to-r from-cyan-700 to-cyan-600 px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:from-cyan-600 hover:to-cyan-500 disabled:cursor-not-allowed disabled:border-slate-600 disabled:from-slate-700 disabled:to-slate-700 disabled:shadow-none"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
