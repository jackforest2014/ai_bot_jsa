import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import ChatInput from '@/components/chat/ChatInput'
import ChatStatusIndicator from '@/components/chat/ChatStatusIndicator'
import ChatWorkspaceDock from '@/components/chat/ChatWorkspaceDock'
import MessageList from '@/components/chat/MessageList'
import FileWorkspacePanel from '@/components/files/FileWorkspacePanel'
import TaskSidebar from '@/components/tasks/TaskSidebar'
import { useChatStream } from '@/hooks/useChatStream'
import { useStickToBottomScroll } from '@/hooks/useStickToBottomScroll'
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
    tasksRefreshTick,
  } = useChatStream()
  const { scrollRef, contentRef, onScroll, afterUserSentIntent } = useStickToBottomScroll(messages)
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {showSyncing ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">正在同步用户信息…</p>
      ) : null}

      {showUserError ? (
        <div className="rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/35 dark:bg-red-950/40 dark:text-red-100">
          未能加载用户资料，请检查令牌后重新
          <Link
            to="/login"
            className="ml-1 font-medium text-cyan-700 underline hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
          >
            登录
          </Link>
          。
        </div>
      ) : null}

      {user && isProfileIncomplete(user) ? (
        <div className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/30 dark:text-amber-100">
          显示名称尚未同步。AI 可在首轮对话中引导补全；也可前往{' '}
          <Link
            to="/settings"
            className="font-medium text-cyan-700 underline hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
          >
            设置
          </Link>{' '}
          查看资料。
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
            <header className="flex flex-col gap-1 px-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <h2
                className="truncate bg-gradient-to-r from-cyan-700 via-slate-800 to-slate-600 bg-clip-text text-lg font-semibold text-transparent dark:from-cyan-200 dark:via-slate-100 dark:to-slate-300"
                title={sessionTitle}
              >
                {sessionTitle}
              </h2>
              <ChatStatusIndicator />
            </header>

            {error ? (
              <p className="text-sm text-red-600 dark:text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            {historyLoading ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">正在加载本会话…</p>
            ) : null}

            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-cyan-500/30 bg-white/90 p-3 shadow-sm backdrop-blur-sm sm:p-4 dark:border-cyan-500/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(34,211,238,0.06),0_12px_40px_rgba(0,0,0,0.35)]"
            >
              <div ref={contentRef} className="min-h-0">
                <MessageList
                  messages={messages}
                  streaming={streaming}
                  className="min-h-0"
                  onRetryAfterUser={retryAfterUserMessage}
                  regenerateAssistantDisabled={streaming || historyLoading}
                  emptyHint={
                    <p className="text-sm text-slate-500 dark:text-slate-500">
                      {historyLoading ? '…' : '发送消息开始对话；会话与历史在左侧列表切换。'}
                    </p>
                  }
                />
              </div>
            </div>

            <div className="min-h-[1.375rem] shrink-0">
              {streamStatusHint ? (
                <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
                  {streamStatusHint}
                </p>
              ) : null}
            </div>

            <ChatInput
              value={draft}
              onChange={setDraft}
              onSend={(text) => {
                afterUserSentIntent()
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

        <div className="flex max-h-[min(48vh,440px)] min-h-[200px] w-full shrink-0 flex-col overflow-hidden lg:max-h-none lg:h-full lg:min-h-0 lg:w-72">
          <TaskSidebar
            disabled={inputDisabled}
            tasksRefreshTick={tasksRefreshTick}
            onInsertSnippet={(snippet) =>
              setDraft((d) => (d.trim() ? `${d}\n${snippet}` : snippet))
            }
          />
        </div>
      </div>

      <ChatWorkspaceDock>
        <FileWorkspacePanel disabled={inputDisabled} />
      </ChatWorkspaceDock>
    </div>
  )
}
