import debounce from 'lodash/debounce'
import throttle from 'lodash/throttle'

export function formatDateTime(
  input: number | Date,
  locale: string = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN',
): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  let n = bytes
  let u = 0
  while (n >= 1024 && u < UNITS.length - 1) {
    n /= 1024
    u += 1
  }
  const digits = u === 0 ? 0 : n >= 10 ? 0 : 1
  return `${n.toFixed(digits)} ${UNITS[u]}`
}

export { debounce, throttle }
