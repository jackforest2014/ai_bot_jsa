export const TOKEN_STORAGE_KEY = 'token'

/** 与 tech_design §4.1 `localStorage.user` 一致，由 userStore 持久化写入 */
export const USER_STORAGE_KEY = 'user'

export function getStoredToken(): string | null {
  const t = localStorage.getItem(TOKEN_STORAGE_KEY)
  return t?.trim() ? t : null
}

export function isAuthenticated(): boolean {
  return getStoredToken() !== null
}

/** 登录成功后写入；阶段二可由 userStore 协同 */
export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}
