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
        className="w-full max-w-sm rounded-xl border border-red-300/80 bg-white p-5 text-slate-900 shadow-xl dark:border-red-400/45 dark:bg-slate-950 dark:text-slate-100 dark:shadow-[0_24px_64px_rgba(0,0,0,0.75),0_0_0_1px_rgba(248,113,113,0.25)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onCancel()
        }}
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          删除会话
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          确定删除「
          <span className="font-medium text-slate-900 dark:text-slate-100">{session.title}</span>
          」？聊天记录将一并删除且
          <span className="font-semibold text-red-600 dark:text-red-300">不可恢复</span>。
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border-0 bg-gradient-to-r from-red-600 to-red-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(220,38,38,0.45)] transition hover:from-red-500 hover:to-red-400 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600 disabled:shadow-none dark:shadow-[0_4px_24px_rgba(248,113,113,0.35)]"
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
