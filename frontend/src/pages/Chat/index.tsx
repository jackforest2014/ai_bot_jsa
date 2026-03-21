import { useState } from 'react'
import { Link } from 'react-router-dom'

import ChatInput from '@/components/chat/ChatInput'
import ChatStatusIndicator from '@/components/chat/ChatStatusIndicator'
import MessageList from '@/components/chat/MessageList'
import TaskSidebar from '@/components/tasks/TaskSidebar'
import { useChatStream } from '@/hooks/useChatStream'
import { isProfileIncomplete } from '@/lib/profile'
import { useUserStore } from '@/store/userStore'

export default function ChatPage() {
  const user = useUserStore((s) => s.user)
  const token = useUserStore((s) => s.token)
  const profileHydrated = useUserStore((s) => s.profileHydrated)
  const profileLoading = useUserStore((s) => s.profileLoading)

  const { messages, send, retryAfterUserMessage, stop, streaming, error, streamStatusHint } =
    useChatStream()
  const [draft, setDraft] = useState('')

  const showSyncing = Boolean(token && !profileHydrated && profileLoading)
  const showUserError = Boolean(token && profileHydrated && !user)
  // 须等 AppShell 完成 GET /api/user；勿用 localStorage 里残留 user 提前打开任务侧栏（会带无效 Bearer 刷 401）
  const inputDisabled = Boolean(
    !token || !user || !profileHydrated || showSyncing || showUserError,
  )

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">对话</h2>

      {showSyncing ? <p className="text-sm text-slate-600">正在同步用户信息…</p> : null}

      {showUserError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          未能加载用户资料，请检查令牌后重新
          <Link to="/login" className="ml-1 font-medium underline">
            登录
          </Link>
          。
        </div>
      ) : null}

      {user && isProfileIncomplete(user) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          资料尚未补充完整。AI 会在对话中引导补全姓名与邮箱；也可前往{' '}
          <Link to="/settings" className="font-medium underline">
            设置
          </Link>{' '}
          补充。
        </div>
      ) : null}

      <ChatStatusIndicator />

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
            <MessageList
              messages={messages}
              className="min-h-0"
              onRetryAfterUser={(userId) => void retryAfterUserMessage(userId)}
              emptyHint={
                <p className="text-sm text-slate-500">
                  发送消息以开始对话（流式 URL：`apiUrl(&apos;/api/chat/stream&apos;)`）。
                </p>
              }
            />
          </div>

          {streamStatusHint ? (
            <p className="text-sm text-slate-600" aria-live="polite">
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
            disabled={inputDisabled}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          />
        </div>

        <TaskSidebar
          disabled={inputDisabled}
          onInsertSnippet={(snippet) => setDraft((d) => (d.trim() ? `${d}\n${snippet}` : snippet))}
        />
      </div>

      <p className="text-xs text-slate-500">
        已安装 <code className="rounded bg-slate-100 px-1">ai</code> /{' '}
        <code className="rounded bg-slate-100 px-1">@ai-sdk/react</code>
        ，当前按技术方案采用 <code className="rounded bg-slate-100 px-1">fetch</code> 自解析
        SSE；后续可改用
        <code className="rounded bg-slate-100 px-1">useChat</code> 自定义 transport。
      </p>
    </div>
  )
}
