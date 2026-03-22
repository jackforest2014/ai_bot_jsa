import { create } from 'zustand'

import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '@/router/guards'
import { useChatSessionStore } from '@/store/chatSessionStore'
import type { User } from '@/types/user'

interface UserStore {
  user: User | null
  token: string | null
  aiNickname: string
  /** 是否已完成一次「有 token 时拉取 /api/user」的尝试（成功或失败后为 true） */
  profileHydrated: boolean
  profileLoading: boolean
  setUser: (user: User) => void
  setToken: (token: string | null) => void
  setAiNickname: (nickname: string) => void
  setPreferences: (p: Record<string, unknown>) => void
  clearUser: () => void
}

function parseUserFromStorage(raw: string | null): User | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

/** 登录 API 返回的是 JWT（`sub` = user.id），与明文 `users.id` 令牌区分 */
function isLikelyJwt(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every((p) => p.length > 0)
}

/**
 * 旧版「模拟登录」使用 dev-token / dev-user，后端 D1 中不存在，会导致大量 401。
 * 明文 Bearer = `users.id` 时，缓存的 user.id 须与 token 一致。
 * JWT 与 user.id 永不相等，不得因此清空 `localStorage.user`，否则刷新后 user 为空、会话/bootstrap 被 profile 门闩卡住。
 */
function loadInitial(): Pick<
  UserStore,
  'user' | 'token' | 'aiNickname' | 'profileHydrated' | 'profileLoading'
> {
  let token = localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() || null
  let user = parseUserFromStorage(localStorage.getItem(USER_STORAGE_KEY))

  if (token === 'dev-token' || user?.id === 'dev-user') {
    token = null
    user = null
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  } else if (token && user && !isLikelyJwt(token) && user.id !== token) {
    user = null
    localStorage.removeItem(USER_STORAGE_KEY)
  }

  return {
    user,
    token,
    aiNickname: user?.ai_nickname?.trim() || '助手',
    profileHydrated: false,
    /** 有令牌但尚无用户摘要时，避免首帧误判为「已结束加载」 */
    profileLoading: Boolean(token && !user),
  }
}

/** 写入 `TOKEN_STORAGE_KEY` / `USER_STORAGE_KEY`（user 含 preferences 摘要），与 6.6 / guards 约定一致 */
function persistAuth(snapshot: Pick<UserStore, 'user' | 'token' | 'aiNickname'>) {
  const { user, token, aiNickname } = snapshot
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
  else localStorage.removeItem(TOKEN_STORAGE_KEY)
  if (user) {
    const summary: User = {
      ...user,
      ai_nickname: aiNickname,
      preferences: user.preferences ?? {},
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(summary))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

export const useUserStore = create<UserStore>((set, get) => ({
  ...loadInitial(),
  setUser: (user) => {
    const aiNickname = user.ai_nickname?.trim() || get().aiNickname || '助手'
    const token = get().token
    set({ user, aiNickname, profileHydrated: true, profileLoading: false })
    persistAuth({ user, token, aiNickname })
  },
  setToken: (token) => {
    const t = token?.trim() || null
    const prev = get().token
    if (!t) {
      set({
        token: null,
        user: null,
        aiNickname: '助手',
        profileHydrated: true,
        profileLoading: false,
      })
      persistAuth({ user: null, token: null, aiNickname: '助手' })
      return
    }
    const sameToken = prev === t
    if (!sameToken) {
      /** 换令牌 = 换用户风险；清空会话列表与选中 id，避免沿用上一用户的 activeSessionId 去拉 /messages */
      useChatSessionStore.getState().reset()
      useChatSessionStore.setState({ listLoading: true })
      const aiNickname = get().aiNickname
      set({
        token: t,
        user: null,
        profileHydrated: false,
        profileLoading: false,
        aiNickname,
      })
      persistAuth({ user: null, token: t, aiNickname })
      return
    }
    set({ token: t, profileHydrated: false, profileLoading: false })
    persistAuth({ user: get().user, token: t, aiNickname: get().aiNickname })
  },
  setAiNickname: (nickname) => {
    const user = get().user
    set({
      aiNickname: nickname,
      user: user ? { ...user, ai_nickname: nickname } : user,
    })
    persistAuth({
      user: user ? { ...user, ai_nickname: nickname } : null,
      token: get().token,
      aiNickname: nickname,
    })
  },
  setPreferences: (p) => {
    const prev = get().user
    const user = prev ? { ...prev, preferences: { ...(prev.preferences ?? {}), ...p } } : prev
    set({ user })
    persistAuth({ user, token: get().token, aiNickname: get().aiNickname })
  },
  clearUser: () => {
    useChatSessionStore.getState().reset()
    set({
      user: null,
      token: null,
      aiNickname: '助手',
      profileHydrated: true,
      profileLoading: false,
    })
    persistAuth({ user: null, token: null, aiNickname: '助手' })
  },
}))
