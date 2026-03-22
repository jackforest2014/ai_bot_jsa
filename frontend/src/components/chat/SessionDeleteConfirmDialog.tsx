import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { ChatSession } from '@/types/chat'

export interface SessionDeleteConfirmDialogProps {
  session: ChatSession | null
  busy?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export default function SessionDeleteConfirmDialog({
  session,
  busy = false,
  onConfirm,
  onCancel,
}: SessionDeleteConfirmDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!session) return
    cancelRef.current?.focus()
  }, [session])

  if (!session) return null

  const node = (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md dark:bg-slate-950/85"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-red-300/80 bg-white p-5 shadow-xl dark:border-red-500/30 dark:bg-slate-900/98 dark:shadow-[0_24px_64px_rgba(0,0,0,0.65),0_0_0_1px_rgba(248,113,113,0.12)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onCancel()
        }}
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          删除会话
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          确定删除「<span className="text-slate-900 dark:text-slate-200">{session.title}</span>
          」？聊天记录将一并删除且
          <span className="text-red-600 dark:text-red-300/90">不可恢复</span>。
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-transparent px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:border-slate-500/40 dark:text-slate-400 dark:hover:border-slate-400/60 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border-0 bg-gradient-to-r from-red-600 to-red-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(220,38,38,0.45)] transition hover:from-red-500 hover:to-red-400 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600 disabled:shadow-none"
            onClick={() => void onConfirm()}
          >
            {busy ? '删除中…' : '删除'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
