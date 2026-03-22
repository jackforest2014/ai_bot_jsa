/** 当前页是否为本地开发主机（开发环境下用于显示「开发调试」等仅本地需要的入口） */
export function isLocalhostHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h.endsWith('.localhost')
  )
}
