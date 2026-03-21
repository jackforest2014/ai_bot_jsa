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
  notifications: UiNotification[]
  chatStatus: ChatStatus
  setGlobalLoading: (v: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
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
      notifications: [],
      chatStatus: 'idle',
      setGlobalLoading: (globalLoading) => set({ globalLoading }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
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
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
