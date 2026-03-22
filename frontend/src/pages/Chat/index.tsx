import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import ChatInput from '@/components/chat/ChatInput'
import ChatStatusIndicator from '@/components/chat/ChatStatusIndicator'
import MessageList from '@/components/chat/MessageList'
import TaskSidebar from '@/components/tasks/TaskSidebar'
import { useChatStream } from '@/hooks/useChatStream'
import { isProfileIncomplete } from '@/lib/profile'
import { useChatSessionStore } from '@/store/chatSessionStore'
import { useUserStore } from '@/store/userStore'

export default function ChatPage() {
  const user = useUserStore((s) => s.user)
  const token = useUserStore((s) => s.token)
  const profileHydrated = useUserStore((s) => s.profileHydrated)
  const profileLoading = useUserStore((s) => s.profileLoading)

  const sessions = useChatSessionStore((s) => s.sessions)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)

  const {
    messages,
    send,
    retryAfterUserMessage,
    stop,
    streaming,
    error,
    streamStatusHint,
    historyLoading,
  } = useChatStream()
  const [draft, setDraft] = useState('')

  const showSyncing = Boolean(token && profileLoading && !user)
  const showUserError = Boolean(token && profileHydrated && !user)
  const awaitingUser = Boolean(token && !user && (!profileHydrated || profileLoading))
  const inputDisabled = Boolean(!token || !user || showUserError || awaitingUser)

  const sessionTitle = useMemo(() => {
    if (!activeSessionId) return '对话'
    return sessions.find((s) => s.id === activeSessionId)?.title ?? '对话'
  }, [sessions, activeSessionId])

  const chatBlocked = inputDisabled || historyLoading

  return (
    <div className="space-y-3">
      {showSyncing ? <p className="text-sm text-slate-400">正在同步用户信息…</p> : null}

      {showUserError ? (
        <div className="rounded-lg border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          未能加载用户资料，请检查令牌后重新
          <Link to="/login" className="ml-1 font-medium text-cyan-300 underline hover:text-cyan-200">
            登录
          </Link>
          。
        </div>
      ) : null}

      {user && isProfileIncomplete(user) ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          显示名称尚未同步。AI 可在首轮对话中引导补全；也可前往{' '}
          <Link to="/settings" className="font-medium text-cyan-300 underline hover:text-cyan-200">
            设置
          </Link>{' '}
          查看资料。
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex w-full max-w-3xl flex-col gap-3">
            <header className="flex flex-col gap-1 px-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <h2
                className="truncate bg-gradient-to-r from-cyan-200 via-slate-100 to-slate-300 bg-clip-text text-lg font-semibold text-transparent"
                title={sessionTitle}
              >
                {sessionTitle}
              </h2>
              <ChatStatusIndicator />
            </header>

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            {historyLoading ? <p className="text-sm text-slate-400">正在加载本会话…</p> : null}

            <div className="min-h-[40vh] flex-1 overflow-y-auto rounded-xl border border-cyan-500/20 bg-slate-950/55 p-3 shadow-[inset_0_1px_0_rgba(34,211,238,0.06),0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:p-4">
              <MessageList
                messages={messages}
                className="min-h-0"
                onRetryAfterUser={retryAfterUserMessage}
                emptyHint={
                  <p className="text-sm text-slate-500">
                    {historyLoading ? '…' : '发送消息开始对话；会话与历史在左侧列表切换。'}
                  </p>
                }
              />
            </div>

            {streamStatusHint ? (
              <p className="text-sm text-slate-400" aria-live="polite">
                {streamStatusHint}
              </p>
            ) : null}

            <ChatInput
              value={draft}
              onChange={setDraft}
              onSend={(text) => {
                void send(text)
                setDraft('')
              }}
              isStreaming={streaming}
              onAbort={stop}
              disabled={chatBlocked}
              placeholder={
                historyLoading ? '正在加载会话历史…' : '输入消息，Enter 发送，Shift+Enter 换行'
              }
            />
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <TaskSidebar
            disabled={inputDisabled}
            onInsertSnippet={(snippet) =>
              setDraft((d) => (d.trim() ? `${d}\n${snippet}` : snippet))
            }
          />
        </div>
      </div>
    </div>
  )
}
