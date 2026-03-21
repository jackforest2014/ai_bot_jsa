import { create } from 'zustand'

import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '@/router/guards'
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

function loadInitial(): Pick<
  UserStore,
  'user' | 'token' | 'aiNickname' | 'profileHydrated' | 'profileLoading'
> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() || null
  const user = parseUserFromStorage(localStorage.getItem(USER_STORAGE_KEY))
  return {
    user,
    token,
    aiNickname: user?.ai_nickname?.trim() || '助手',
    profileHydrated: false,
    profileLoading: false,
  }
}

/** 写入技术方案 §4.1 的 `localStorage.user` / `localStorage.token` */
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
