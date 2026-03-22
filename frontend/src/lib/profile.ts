import type { User } from '@/types/user'

/** PRD v1.2：邮箱可空；仅缺显示名称时视为不完整（AI 可在首轮引导补全其余项） */
export function isProfileIncomplete(user: User | null | undefined): boolean {
  if (!user) return false
  return !user.name?.trim()
}
