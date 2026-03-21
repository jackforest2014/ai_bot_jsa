import type { User } from '@/types/user'

/** 资料未全量：缺姓名或邮箱时视为不完整（PRD：AI 在对话内引导补全） */
export function isProfileIncomplete(user: User | null | undefined): boolean {
  if (!user) return false
  return !user.name?.trim() || !user.email?.trim()
}
