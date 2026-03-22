import { useEffect, useRef, useState } from 'react'

export interface SessionRenameInlineProps {
  initialTitle: string
  onCommit: (title: string) => void | Promise<void>
  onCancel: () => void
}

/**
 * 会话行内重命名：失焦 / 回车提交，Esc 取消（任务 4.4）。
 */
export default function SessionRenameInline({
  initialTitle,
  onCommit,
  onCancel,
}: SessionRenameInlineProps) {
  const [value, setValue] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    setValue(initialTitle)
  }, [initialTitle])

  useEffect(() => {
    const el = inputRef.current
    el?.focus()
    el?.select()
  }, [])

  const submit = async () => {
    if (committedRef.current) return
    const t = value.trim()
    if (!t) {
      onCancel()
      return
    }
    if (t === initialTitle) {
      onCancel()
      return
    }
    committedRef.current = true
    try {
      await onCommit(t)
    } catch {
      committedRef.current = false
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void submit()}
      onKeyDown={(e) => {
        // 避免空格/其它键冒泡到外层 role="button" 行，触发 onSelect 退出编辑
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="w-full rounded border border-cyan-500/60 bg-white px-1.5 py-0.5 text-xs text-slate-900 outline-none ring-1 ring-cyan-500/25 placeholder:text-slate-400 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
      onClick={(e) => e.stopPropagation()}
    />
  )
}
