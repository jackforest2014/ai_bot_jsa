import { Link } from 'react-router-dom'

import { isProfileIncomplete } from '@/lib/profile'
import { useUserStore } from '@/store/userStore'

export default function SettingsPage() {
  const user = useUserStore((s) => s.user)

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">设置</h2>

      {user && isProfileIncomplete(user) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          当前资料未全量。除在此处维护外，也可在{' '}
          <Link to="/" className="font-medium underline">
            对话
          </Link>{' '}
          中由 AI 引导补全（PRD）。
        </div>
      ) : null}

      {user ? (
        <dl className="max-w-md space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">用户 ID</dt>
            <dd className="text-right font-mono text-slate-900">{user.id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">姓名</dt>
            <dd className="text-right text-slate-900">{user.name?.trim() || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">邮箱</dt>
            <dd className="text-right text-slate-900">{user.email?.trim() || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">AI 昵称</dt>
            <dd className="text-right text-slate-900">{user.ai_nickname ?? '—'}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-slate-600">暂无用户信息，请从对话页或重新登录后同步。</p>
      )}

      <p className="text-slate-600">偏好与表单编辑在阶段五对接 `PUT /api/user`。</p>
    </div>
  )
}
