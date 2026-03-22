import { MAX_FILE_BYTES, MULTIPART_PART_BYTES, SMALL_UPLOAD_MAX_BYTES } from '@/types/file'

describe('file size limits (PRD / §11)', () => {
  it('enforces 64MB client ceiling', () => {
    expect(MAX_FILE_BYTES).toBe(64 * 1024 * 1024)
  })

  it('aligns small upload and multipart part with backend', () => {
    expect(SMALL_UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(MULTIPART_PART_BYTES).toBe(5 * 1024 * 1024)
  })
})
