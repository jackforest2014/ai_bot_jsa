import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

import { userAPI } from '@/api/user'
import { isProfileIncomplete } from '@/lib/profile'
import { requestUploadNotificationPermission } from '@/lib/upload-notifications'
import { userFromApi } from '@/lib/user-from-api'
import { useThemeStore } from '@/store/themeStore'
import { useUserStore } from '@/store/userStore'

export default function SettingsPage() {
  const colorMode = useThemeStore((s) => s.colorMode)
  const setColorMode = useThemeStore((s) => s.setColorMode)
  const user = useUserStore((s) => s.user)
  const token = useUserStore((s) => s.token)
  const profileLoading = useUserStore((s) => s.profileLoading)
  const profileHydrated = useUserStore((s) => s.profileHydrated)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [aiNickname, setAiNickname] = useState('助手')
  const [preferencesText, setPreferencesText] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    setName(user.name ?? '')
    setEmail(user.email?.trim() ? user.email : '')
    setAiNickname(user.ai_nickname?.trim() || '助手')
    setPreferencesText(JSON.stringify(user.preferences ?? {}, null, 2))
  }, [user])

  const handleSaveProfile = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('显示名称不能为空')
      return
    }
    let preferences: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(preferencesText)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('偏好须为 JSON 对象（非数组）')
        return
      }
      preferences = parsed as Record<string, unknown>
    } catch {
      toast.error('偏好 JSON 格式无效')
      return
    }

    setSaving(true)
    try {
      const rawProfile = await userAPI.updateUser({
        name: trimmedName,
        email: email.trim() === '' ? null : email.trim(),
        preferences,
      })
      let next = userFromApi(rawProfile)
      useUserStore.getState().setUser(next)

      const nick = aiNickname.trim() || '助手'
      const rawAi = await userAPI.setAiNickname(nick)
      next = userFromApi(rawAi)
      useUserStore.getState().setUser(next)

      toast.success('已保存设置')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRequestNotif = async () => {
    const p = await requestUploadNotificationPermission()
    setNotifPermission(p)
    if (p === 'granted') toast.success('已开启上传系统通知')
    else if (p === 'denied') toast.error('通知权限被拒绝，可在浏览器站点设置中修改')
    else toast('可稍后在浏览器提示中选择允许', { icon: 'ℹ️' })
  }

  const showSyncing = Boolean(token && profileLoading && !user)

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <h2 className="bg-gradient-to-r from-cyan-700 to-slate-700 bg-clip-text text-xl font-semibold text-transparent dark:from-cyan-200 dark:to-slate-200">
        设置
      </h2>

      <section className="max-w-xl space-y-3 rounded-lg border border-cyan-500/30 bg-white/95 p-4 shadow-sm backdrop-blur-sm dark:border-cyan-500/20 dark:bg-slate-950/55 dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">外观</h3>
        <p className="text-xs text-slate-600 dark:text-slate-500">选择界面配色；与顶栏 ☀/☾ 按钮同步。</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setColorMode('dark')}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              colorMode === 'dark'
                ? 'border-cyan-500/50 bg-cyan-100 text-cyan-900 dark:border-cyan-400/60 dark:bg-cyan-500/20 dark:text-cyan-100'
                : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-400/50 dark:border-slate-600/80 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-cyan-500/40'
            }`}
          >
            深色
          </button>
          <button
            type="button"
            onClick={() => setColorMode('light')}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              colorMode === 'light'
                ? 'border-cyan-500/50 bg-cyan-100 text-cyan-900 dark:border-cyan-400/60 dark:bg-cyan-500/20 dark:text-cyan-100'
                : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-400/50 dark:border-slate-600/80 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-cyan-500/40'
            }`}
          >
            亮色
          </button>
        </div>
      </section>

      {showSyncing ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">正在同步用户信息…</p>
      ) : null}

      {user && isProfileIncomplete(user) ? (
        <div className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/30 dark:text-amber-100">
          显示名称缺失。可在{' '}
          <Link
            to="/"
            className="font-medium text-cyan-700 underline hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200"
          >
            对话
          </Link>{' '}
          中由 AI 引导补全，或在此填写后保存。
        </div>
      ) : null}

      {!token ? (
        <p className="text-slate-600 dark:text-slate-400">未登录，请前往登录页建立会话。</p>
      ) : !user && profileHydrated ? (
        <p className="text-slate-600 dark:text-slate-400">暂无用户信息，请检查令牌或网络后重试。</p>
      ) : user ? (
        <div className="max-w-xl space-y-6">
          <section className="space-y-4 rounded-lg border border-cyan-500/30 bg-white/95 p-4 shadow-sm backdrop-blur-sm dark:border-cyan-500/20 dark:bg-slate-950/55 dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">资料与偏好</h3>
            <p className="text-xs text-slate-600 dark:text-slate-500">
              与{' '}
              <code className="rounded bg-slate-200 px-1 text-cyan-800 dark:bg-slate-800/90 dark:text-cyan-200/90">
                PUT /api/user
              </code>
              、
              <code className="rounded bg-slate-200 px-1 text-cyan-800 dark:bg-slate-800/90 dark:text-cyan-200/90">
                PUT /api/user/ai-name
              </code>{' '}
              同步至{' '}
              <code className="rounded bg-slate-200 px-1 text-cyan-800 dark:bg-slate-800/90 dark:text-cyan-200/90">
                userStore
              </code>{' '}
              与本地摘要。
            </p>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              显示名称
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoComplete="name"
              />
            </label>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              邮箱（可选）
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                placeholder="留空可清空邮箱"
              />
            </label>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              AI 助手昵称
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100"
                value={aiNickname}
                onChange={(e) => setAiNickname(e.target.value)}
                disabled={saving}
              />
            </label>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              偏好（JSON 对象，写入{' '}
              <code className="text-cyan-700 dark:text-cyan-200/90">preferences_json</code>）
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100"
                rows={8}
                value={preferencesText}
                onChange={(e) => setPreferencesText(e.target.value)}
                disabled={saving}
                spellCheck={false}
              />
            </label>

            <button
              type="button"
              disabled={saving}
              className="rounded-md border border-cyan-500/40 bg-gradient-to-r from-cyan-700 to-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:from-cyan-600 hover:to-cyan-500 disabled:opacity-50"
              onClick={() => void handleSaveProfile()}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </section>

          <section className="space-y-3 rounded-lg border border-cyan-500/30 bg-white/95 p-4 shadow-sm backdrop-blur-sm dark:border-cyan-500/20 dark:bg-slate-950/55 dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">上传完成通知</h3>
            <p className="text-xs text-slate-600 dark:text-slate-500">
              使用浏览器 Notification API 显示上传成功或失败（需在支持的环境并授予权限）。
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              当前权限：
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {typeof Notification === 'undefined' ? '不支持' : notifPermission}
              </span>
            </p>
            <button
              type="button"
              disabled={typeof Notification === 'undefined' || notifPermission === 'granted'}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:border-cyan-500/50 hover:text-cyan-800 disabled:opacity-50 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-cyan-500/35 dark:hover:text-cyan-100"
              onClick={() => void handleRequestNotif()}
            >
              {notifPermission === 'granted' ? '已开启' : '请求通知权限'}
            </button>
          </section>

          <dl className="space-y-2 rounded-lg border border-dashed border-cyan-400/50 bg-slate-50 p-3 text-xs text-slate-600 dark:border-cyan-500/25 dark:bg-slate-950/40 dark:text-slate-400">
            <div className="flex justify-between gap-4">
              <dt>用户 ID</dt>
              <dd className="text-right font-mono text-slate-800 dark:text-slate-200">{user.id}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  )
}
