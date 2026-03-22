import { request } from '@/api/client'
import type { User } from '@/types/user'

/** GET/PUT 结果经 `userStore.setUser` 等与 `localStorage.user`（含 preferences）同步，见阶段六 6.6 */
export const userAPI = {
  getUser: () => request<User>('/api/user'),

  updateUser: (data: {
    name?: string
    email?: string | null
    preferences?: Record<string, unknown>
  }) =>
    request<User>('/api/user', { method: 'PUT', body: JSON.stringify(data) }),

  /** PUT /api/user/ai-name，body `{ nickname }`（技术方案 §5.2） */
  setAiNickname: (nickname: string) =>
    request<User | Record<string, never>>('/api/user/ai-name', {
      method: 'PUT',
      body: JSON.stringify({ nickname }),
    }),
}
