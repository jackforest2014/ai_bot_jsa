import { useState } from 'react'
import toast from 'react-hot-toast'

import { sessionsAPI } from '@/api/sessions'
import type { ChatSession } from '@/types/chat'
import { useChatSessionStore } from '@/store/chatSessionStore'

import SessionDeleteConfirmDialog from './SessionDeleteConfirmDialog'
import SessionListItem from './SessionListItem'

function sortSessions<T extends { updated_at?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))
}

/**
 * 侧栏会话列表：按 `updated_at` 排序、当前会话高亮、新对话、重命名与删除（删除需确认）。
 */
export default function SessionList() {
  const sessions = useChatSessionStore((s) => s.sessions)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const setActiveSessionId = useChatSessionStore((s) => s.setActiveSessionId)
  const upsertSession = useChatSessionStore((s) => s.upsertSession)
  const removeSession = useChatSessionStore((s) => s.removeSession)
  const listLoading = useChatSessionStore((s) => s.listLoading)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const sorted = sortSessions(sessions)

  const newChat = async () => {
    try {
      const s = await sessionsAPI.create()
      upsertSession(s)
      setActiveSessionId(s.id)
      setRenamingId(null)
      toast.success('已创建新对话')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建会话失败')
    }
  }

  const handleRenameCommit = async (id: string, title: string) => {
    try {
      const row = await sessionsAPI.rename(id, title)
      upsertSession(row)
      setRenamingId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重命名失败')
      throw e
    }
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return
    setDeleteBusy(true)
    try {
      await sessionsAPI.remove(pendingDelete.id)
      removeSession(pendingDelete.id)
      setRenamingId(null)
      setPendingDelete(null)
      toast.success('已删除会话')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (listLoading && sessions.length === 0) {
    return <p className="px-1 text-xs text-slate-500 dark:text-slate-400">加载会话…</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-500/70">
          历史
        </span>
        <button
          type="button"
          onClick={() => void newChat()}
          className="rounded border border-cyan-500/50 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-800 hover:border-cyan-500/70 hover:bg-cyan-100/90 dark:border-cyan-500/35 dark:bg-cyan-950/30 dark:text-cyan-200/90 dark:hover:border-cyan-400/50 dark:hover:bg-cyan-950/50"
        >
          新对话
        </button>
      </div>
      <p className="px-0.5 text-[10px] leading-tight text-slate-600 dark:text-slate-500">
        右键或铅笔图标可改名称；垃圾桶图标删除会话
      </p>
      <div className="max-h-64 space-y-0.5 overflow-y-auto pr-0.5">
        {sorted.length === 0 ? (
          <p className="px-1 text-xs text-slate-500 dark:text-slate-400">暂无会话，点击「新对话」开始。</p>
        ) : (
          sorted.map((s) => (
            <SessionListItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              renaming={renamingId === s.id}
              onSelect={() => {
                setRenamingId(null)
                setActiveSessionId(s.id)
              }}
              onRequestRename={() => setRenamingId(s.id)}
              onRequestDelete={() => setPendingDelete(s)}
              onRenameCommit={(title) => handleRenameCommit(s.id, title)}
              onRenameCancel={() => setRenamingId(null)}
            />
          ))
        )}
      </div>

      <SessionDeleteConfirmDialog
        session={pendingDelete}
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setPendingDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
