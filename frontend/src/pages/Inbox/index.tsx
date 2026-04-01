import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

import { sessionsAPI } from '@/api/sessions'
import type { ChatSession } from '@/types/chat'
import { useChatSessionStore } from '@/store/chatSessionStore'

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function InboxPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const setActive = useChatSessionStore((s) => s.setActiveSessionId)
  const storeSessions = useChatSessionStore((s) => s.sessions)

  useEffect(() => {
    setLoading(true)
    sessionsAPI
      .listInbox()
      .then(setSessions)
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const handleOpen = (session: ChatSession) => {
    // Make this session appear in the store so ChatPage can render it
    const existing = storeSessions.find((s) => s.id === session.id)
    if (!existing) {
      useChatSessionStore.getState().setSessions([session, ...storeSessions])
    }
    setActive(session.id)
    void navigate('/')
  }

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <h2 className="bg-gradient-to-r from-cyan-700 to-slate-700 bg-clip-text text-xl font-semibold text-transparent dark:from-cyan-200 dark:to-slate-200">
        访客收件箱
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        以下是通过您的专属代理链接与 AI
        分身对话的访客留言记录。点击任意条目可跳转查看完整对话内容。
      </p>

      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">加载中…</p>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cyan-500/30 bg-white/80 p-6 text-center dark:border-cyan-500/20 dark:bg-slate-950/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">暂无访客留言</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            在设置页面生成专属代理链接，分享给访客后，他们的对话将在此处汇聚。
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleOpen(s)}
                className="w-full rounded-lg border border-cyan-500/20 bg-white/95 px-4 py-3 text-left shadow-sm backdrop-blur-sm transition hover:border-cyan-500/50 hover:shadow-md dark:border-cyan-500/15 dark:bg-slate-950/60 dark:hover:border-cyan-400/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {s.title || '(无标题)'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      会话 ID：{s.id.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200">
                      访客留言
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {formatDate(s.updated_at)}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
