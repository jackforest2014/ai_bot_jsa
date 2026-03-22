import { create } from 'zustand'
import toast from 'react-hot-toast'

import { sessionsAPI } from '@/api/sessions'
import { ACTIVE_SESSION_STORAGE_KEY, getStoredToken } from '@/router/guards'
import type { ChatSession } from '@/types/chat'

interface ChatSessionState {
  sessions: ChatSession[]
  activeSessionId: string | null
  listLoading: boolean
  /** 避免 AppShell 与登录页重复 toast */
  bootstrapErrorShown: boolean
  setSessions: (sessions: ChatSession[]) => void
  setActiveSessionId: (id: string | null) => void
  upsertSession: (s: ChatSession) => void
  removeSession: (id: string) => void
  reset: () => void
  /** 登录后 / 刷新：拉列表、恢复或创建默认会话、校验 localStorage 中的选中 id */
  bootstrap: () => Promise<void>
  /** 发送消息前：若无选中会话则创建 */
  ensureActiveSession: () => Promise<string>
}

function readStoredActiveId(): string | null {
  const v = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)?.trim()
  return v || null
}

function persistActiveId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id)
  else localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
}

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: [],
  /** 6.6：刷新后尽早恢复选中会话；`bootstrap` 会与列表校验并修正 */
  activeSessionId: readStoredActiveId(),
  /** 有令牌时先置为 true，避免子组件在 `bootstrap` 完成前用 localStorage 里的旧 sessionId 抢拉 /messages */
  listLoading: typeof localStorage !== 'undefined' && Boolean(getStoredToken()),
  bootstrapErrorShown: false,

  setSessions: (sessions) => set({ sessions }),

  setActiveSessionId: (id) => {
    persistActiveId(id)
    set({ activeSessionId: id })
  },

  upsertSession: (s) =>
    set((state) => {
      const i = state.sessions.findIndex((x) => x.id === s.id)
      if (i < 0) return { sessions: [s, ...state.sessions] }
      const next = [...state.sessions]
      next[i] = s
      return { sessions: next }
    }),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((x) => x.id !== id)
      let activeSessionId = state.activeSessionId
      if (activeSessionId === id) {
        activeSessionId = sessions[0]?.id ?? null
      }
      if (activeSessionId != null && !sessions.some((s) => s.id === activeSessionId)) {
        activeSessionId = sessions[0]?.id ?? null
      }
      persistActiveId(activeSessionId)
      return { sessions, activeSessionId }
    }),

  reset: () => {
    persistActiveId(null)
    set({
      sessions: [],
      activeSessionId: null,
      listLoading: false,
      bootstrapErrorShown: false,
    })
  },

  bootstrap: async () => {
    set({ listLoading: true })
    try {
      let list = await sessionsAPI.list()
      if (!Array.isArray(list)) list = []
      if (list.length === 0) {
        const created = await sessionsAPI.create()
        list = [created]
      }
      const stored = readStoredActiveId()
      const validStored = stored && list.some((s) => s.id === stored)
      const nextId = validStored ? stored : (list[0]?.id ?? null)
      persistActiveId(nextId)
      set({
        sessions: list,
        activeSessionId: nextId,
        listLoading: false,
        bootstrapErrorShown: false,
      })
    } catch {
      set({
        sessions: [],
        activeSessionId: null,
        listLoading: false,
      })
      if (!get().bootstrapErrorShown) {
        set({ bootstrapErrorShown: true })
        toast.error(
          '会话列表暂不可用（请确认后端已提供 /api/sessions）。仍可尝试发消息时将自动创建会话。',
          {
            duration: 6000,
          },
        )
      }
    }
  },

  ensureActiveSession: async () => {
    const existing = get().activeSessionId
    if (existing) return existing
    try {
      const created = await sessionsAPI.create()
      const sessions = get().sessions
      const next = sessions.some((s) => s.id === created.id) ? sessions : [created, ...sessions]
      persistActiveId(created.id)
      set({ sessions: next, activeSessionId: created.id })
      return created.id
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法创建会话'
      throw new Error(msg)
    }
  },
}))
