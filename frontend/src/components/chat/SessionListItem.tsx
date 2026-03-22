import type { KeyboardEvent } from 'react'

import { IconEditPencil, IconTrash } from '@/components/icons/SessionListIcons'
import type { ChatSession } from '@/types/chat'

import SessionRenameInline from './SessionRenameInline'

export interface SessionListItemProps {
  session: ChatSession
  active: boolean
  renaming: boolean
  onSelect: () => void
  onRequestRename: () => void
  onRequestDelete: () => void
  onRenameCommit: (title: string) => void | Promise<void>
  onRenameCancel: () => void
}

export default function SessionListItem({
  session,
  active,
  renaming,
  onSelect,
  onRequestRename,
  onRequestDelete,
  onRenameCommit,
  onRenameCancel,
}: SessionListItemProps) {
  const onKeyDownRow = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDownRow}
      onContextMenu={(e) => {
        e.preventDefault()
        onRequestRename()
      }}
      className={`rounded-md px-2 py-1.5 text-left outline-none ring-cyan-500/40 focus-visible:ring-2 ${
        active
          ? 'border border-cyan-500/50 bg-cyan-50 text-cyan-950 shadow-sm dark:border-cyan-500/35 dark:bg-cyan-950/45 dark:text-cyan-50 dark:shadow-[0_0_20px_rgba(34,211,238,0.08)]'
          : 'border border-transparent text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700/80 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
      }`}
    >
      {renaming ? (
        <SessionRenameInline
          initialTitle={session.title}
          onCommit={onRenameCommit}
          onCancel={onRenameCancel}
        />
      ) : (
        <div className="flex items-start justify-between gap-1">
          <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-snug">
            {session.title}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              title="重命名"
              onClick={(e) => {
                e.stopPropagation()
                onRequestRename()
              }}
              className={`rounded p-0.5 ${
                active
                  ? 'text-cyan-800 hover:text-cyan-950 dark:text-cyan-200/85 dark:hover:text-cyan-100'
                  : 'text-slate-500 hover:text-cyan-700 dark:hover:text-cyan-300/90'
              }`}
            >
              <IconEditPencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="删除会话"
              onClick={(e) => {
                e.stopPropagation()
                onRequestDelete()
              }}
              className={`rounded p-0.5 ${
                active
                  ? 'text-red-300/75 hover:text-red-200'
                  : 'text-slate-500 hover:text-red-400/90'
              }`}
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
