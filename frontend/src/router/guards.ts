/**
 * 阶段六 6.6：浏览器持久化键（与 `userStore` / `chatSessionStore` / `api/user` 写入路径一致）
 *
 * - `token`：Bearer 用户 id；登录与粘贴令牌时写入，`clearUser` 清除。
 * - `user`：JSON，含 `id`、`name`、`email`、`ai_nickname`、**`preferences` 摘要**（对象，与 GET/PUT `/api/user` 对齐）。
 * - `activeSessionId`：当前选中会话；`setActiveSessionId` / `bootstrap` / `reset` 维护。
 * - `ai-bot-ui`：Zustand `persist`（侧栏折叠等 UI），非认证态。
 */
export const TOKEN_STORAGE_KEY = 'token'

/** 与 tech_design §4.1 `localStorage.user` 一致，由 userStore 持久化写入 */
export const USER_STORAGE_KEY = 'user'

/** 上次选中会话 id；登录后与 `GET /api/sessions` 校验仍存在（技术方案 §4.1） */
export const ACTIVE_SESSION_STORAGE_KEY = 'activeSessionId'

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
