import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ChatStatus = 'idle' | 'thinking' | 'searching' | 'researching'

export type NotificationKind = 'info' | 'success' | 'error'

export interface UiNotification {
  id: string
  message: string
  kind?: NotificationKind
}

interface UiStoreState {
  globalLoading: boolean
  sidebarCollapsed: boolean
  /** 「对话」下会话列表面板展开（与侧栏整体折叠独立，任务 4.4） */
  sessionListPanelOpen: boolean
  notifications: UiNotification[]
  chatStatus: ChatStatus
  setGlobalLoading: (v: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  toggleSessionListPanel: () => void
  setSessionListPanelOpen: (v: boolean) => void
  enqueueNotification: (item: Omit<UiNotification, 'id'> & { id?: string }) => void
  dequeueNotification: (id: string) => void
  clearNotifications: () => void
  setChatStatus: (s: ChatStatus) => void
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      globalLoading: false,
      sidebarCollapsed: false,
      sessionListPanelOpen: true,
      notifications: [],
      chatStatus: 'idle',
      setGlobalLoading: (globalLoading) => set({ globalLoading }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSessionListPanel: () => set((s) => ({ sessionListPanelOpen: !s.sessionListPanelOpen })),
      setSessionListPanelOpen: (sessionListPanelOpen) => set({ sessionListPanelOpen }),
      enqueueNotification: (item) =>
        set((s) => ({
          notifications: [...s.notifications, { ...item, id: item.id ?? nextId() }],
        })),
      dequeueNotification: (id) =>
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
      clearNotifications: () => set({ notifications: [] }),
      setChatStatus: (chatStatus) => set({ chatStatus }),
    }),
    {
      name: 'ai-bot-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sessionListPanelOpen: state.sessionListPanelOpen,
      }),
    },
  ),
)
