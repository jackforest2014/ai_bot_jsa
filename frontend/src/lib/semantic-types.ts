/** 工作空间语义类型选项（可与后端扩展对齐） */
export const SEMANTIC_TYPE_OPTIONS = [
  { value: 'resume', label: '简历' },
  { value: 'contract', label: '合同/协议' },
  { value: 'knowledge', label: '知识文档' },
  { value: 'image', label: '图片' },
  { value: 'code', label: '代码' },
  { value: 'other', label: '其它' },
] as const

const SEMANTIC_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  SEMANTIC_TYPE_OPTIONS.map((o) => [o.value, o.label]),
)

/** API 存英文 code，界面统一展示与上传时一致的中文文案 */
export function semanticTypeLabel(value: string | null | undefined): string {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return '—'
  return SEMANTIC_LABEL_BY_VALUE[v] ?? v
}
