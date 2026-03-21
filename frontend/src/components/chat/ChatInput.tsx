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
    <div className="relative rounded-lg border border-slate-200 bg-white shadow-sm">
      {isStreaming ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-sky-400/40 animate-pulse"
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
          className="min-h-[5.5rem] w-full resize-y rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {isStreaming ? (
          <div className="flex items-center gap-2 px-1 text-xs text-sky-700" aria-live="polite">
            <span className="inline-flex gap-0.5" aria-hidden>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" />
            </span>
            <span>正在生成回复…</span>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          {isStreaming && onAbort ? (
            <button
              type="button"
              onClick={() => onAbort()}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              停止
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={inputDisabled || !value.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
