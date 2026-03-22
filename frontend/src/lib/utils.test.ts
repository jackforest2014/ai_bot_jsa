import { formatDateTime, formatFileSize } from '@/lib/utils'

describe('formatFileSize', () => {
  it('formats bytes and steps through KB/MB', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toMatch(/^5(\.0)? MB$/)
  })

  it('returns em dash for invalid input', () => {
    expect(formatFileSize(NaN)).toBe('—')
    expect(formatFileSize(-1)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats Date and epoch ms with fixed locale', () => {
    const s = formatDateTime(new Date('2024-06-01T12:30:00Z'), 'en-US')
    expect(s.length).toBeGreaterThan(4)
    expect(formatDateTime(1_716_240_000_000, 'en-US')).toMatch(/2024/)
  })
})
