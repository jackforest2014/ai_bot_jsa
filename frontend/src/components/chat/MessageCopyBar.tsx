import { useCallback, useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import type { ChatMessage } from '@/types/chat'
import { extractDialoguePlainText, formatFullMessageForCopy } from '@/lib/message-copy-format'

export interface MessageCopyBarProps {
  message: ChatMessage
  /** 下拉菜单贴齐：用户消息靠右，助手靠左 */
  menuAlign: 'left' | 'right'
  /** 与时间行视觉一致 */
  mutedClass: string
}

function CopyIcon({ className }: { className?: string }) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M7 10l5 5 5-5z" />
    </svg>
  )
}

export default function MessageCopyBar({ message, menuAlign, mutedClass }: MessageCopyBarProps) {
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const copyDialogue = useCallback(async () => {
    const text = extractDialoguePlainText(message.content)
    if (!text.trim()) {
      toast.error('暂无可复制的正文')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制对话内容')
    } catch {
      toast.error('复制失败')
    }
  }, [message.content])

  const copyFull = useCallback(async () => {
    const text = formatFullMessageForCopy(message)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制全部（含元数据）')
    } catch {
      toast.error('复制失败')
    }
    setOpen(false)
  }, [message])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onCopyIconContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setOpen((v) => !v)
  }, [])

  const menuPosition = menuAlign === 'right' ? 'right-0' : 'left-0'

  return (
    <div ref={wrapRef} className={`relative inline-flex shrink-0 items-center gap-px ${mutedClass}`}>
      <button
        type="button"
        title="复制对话内容"
        aria-label="复制对话内容"
        onClick={() => void copyDialogue()}
        onContextMenu={onCopyIconContextMenu}
        className="rounded p-0.5 text-current opacity-70 hover:bg-slate-200/80 hover:opacity-100 dark:hover:bg-slate-700/80"
      >
        <CopyIcon />
      </button>
      <button
        type="button"
        title="更多复制选项"
        aria-label="更多复制选项"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="rounded px-0.5 py-0.5 text-current opacity-70 hover:bg-slate-200/80 hover:opacity-100 dark:hover:bg-slate-700/80"
      >
        <ChevronIcon />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-full z-30 mt-0.5 min-w-[9.5rem] rounded-md border border-slate-200 bg-white py-0.5 text-xs shadow-lg dark:border-slate-600 dark:bg-slate-900 ${menuPosition}`}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-2.5 py-1.5 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={() => {
              void copyDialogue()
              setOpen(false)
            }}
          >
            仅复制对话
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-2.5 py-1.5 text-left text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            onClick={() => void copyFull()}
          >
            复制全部
          </button>
        </div>
      ) : null}
    </div>
  )
}
