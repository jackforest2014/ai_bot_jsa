import { act, renderHook, waitFor } from '@testing-library/react'

import { useFileUpload } from '@/hooks/useFileUpload'
import { MAX_FILE_BYTES, SMALL_UPLOAD_MAX_BYTES } from '@/types/file'

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/upload-notifications', () => ({
  notifyUploadResult: vi.fn(),
  requestUploadNotificationPermission: vi.fn(() => Promise.resolve('denied' as NotificationPermission)),
}))

vi.mock('@/store/userStore', () => ({
  useUserStore: {
    getState: () => ({ token: 'test-token' }),
  },
}))

vi.mock('@/router/guards', () => ({
  TOKEN_STORAGE_KEY: 'token',
}))

describe('useFileUpload', () => {
  it('sets error state when file exceeds 10MB', async () => {
    const { result } = renderHook(() => useFileUpload())
    const buf = new ArrayBuffer(MAX_FILE_BYTES + 1)
    const file = new File([buf], 'huge.bin', { type: 'application/octet-stream' })

    await act(async () => {
      result.current.enqueue([file], { semantic_type: '', folder_path: '', tags: [] })
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
      expect(result.current.items[0]?.status).toBe('error')
      expect(result.current.items[0]?.errorMessage).toMatch(/10/)
    })
  })

  it('completes small file upload via XHR mock', async () => {
    class MockXHR {
      upload: {
        onprogress: ((e: ProgressEventInit & { lengthComputable?: boolean }) => void) | null
      } = { onprogress: null }
      status = 0
      responseText = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      open = vi.fn()
      setRequestHeader = vi.fn()
      send = vi.fn(() => {
        queueMicrotask(() => {
          this.upload.onprogress?.({
            lengthComputable: true,
            loaded: 1,
            total: 1,
          })
          this.status = 201
          this.responseText = JSON.stringify({
            id: 'up1',
            original_name: 'tiny.txt',
            mime_type: 'text/plain',
            size: 1,
            semantic_type: '',
            folder_path: '',
            tags: [],
            processed: 0,
            created_at: 1_700_000_000,
          })
          this.onload?.()
        })
      })
    }

    const OriginalXHR = globalThis.XMLHttpRequest
    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

    const onUploaded = vi.fn()
    const { result } = renderHook(() => useFileUpload({ onUploaded }))

    const file = new File([new Uint8Array([1])], 'tiny.txt', { type: 'text/plain' })
    expect(file.size).toBeLessThanOrEqual(SMALL_UPLOAD_MAX_BYTES)

    await act(async () => {
      result.current.enqueue([file], { semantic_type: 'doc', folder_path: '', tags: [] })
    })

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('success')
      expect(result.current.items[0]?.progress).toBe(100)
    })
    expect(onUploaded).toHaveBeenCalled()

    globalThis.XMLHttpRequest = OriginalXHR
  })
})
