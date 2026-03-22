import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { apiUrl } from '@/api/client'
import { completeMultipart, initiateMultipart, normalizeFileInfo } from '@/api/files'
import { notifyUploadResult, requestUploadNotificationPermission } from '@/lib/upload-notifications'
import { TOKEN_STORAGE_KEY } from '@/router/guards'
import { useUserStore } from '@/store/userStore'
import {
  MAX_FILE_BYTES,
  MULTIPART_PART_BYTES,
  SMALL_UPLOAD_MAX_BYTES,
  type FileInfo,
} from '@/types/file'

const UPLOAD_ATTEMPTS = 3
const PART_ATTEMPTS = 3

export type UploadItemStatus = 'pending' | 'uploading' | 'success' | 'error'

export interface UploadQueueItem {
  clientId: string
  file: File
  semantic_type: string
  folder_path: string
  tags: string[]
  status: UploadItemStatus
  progress: number
  errorMessage?: string
  resultId?: string
}

function authHeader(): string | undefined {
  const token =
    useUserStore.getState().token?.trim() || localStorage.getItem(TOKEN_STORAGE_KEY)?.trim()
  return token ? `Bearer ${token}` : undefined
}

function redirectToLoginIfNeeded(): void {
  if (window.location.pathname === '/login') return
  useUserStore.getState().clearUser()
  const path = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?from=${encodeURIComponent(path)}`)
}

function xhrMessage(xhr: XMLHttpRequest): string {
  const raw = parseXhrJson(xhr)
  const o = raw as { error?: string }
  return typeof o.error === 'string' && o.error.trim() ? o.error : `请求失败（${xhr.status}）`
}

function parseXhrJson(xhr: XMLHttpRequest): unknown {
  const t = xhr.responseText?.trim()
  if (!t) return {}
  try {
    return JSON.parse(t) as unknown
  } catch {
    return { raw: t }
  }
}

function normalizeEtag(header: string | null): string {
  if (!header) return ''
  return header.replace(/^\s*W\//i, '').replace(/^"\s*|\s*"$/g, '')
}

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let i = 0; i < UPLOAD_ATTEMPTS; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (i === UPLOAD_ATTEMPTS - 1) break
    }
  }
  throw last instanceof Error ? last : new Error(String(label))
}

function postFormWithProgress(
  path: string,
  form: FormData,
  onProgress: (pct: number) => void,
): Promise<FileInfo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
    const auth = authHeader()
    if (auth) xhr.setRequestHeader('Authorization', auth)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((100 * e.loaded) / e.total)))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.onload = () => {
      if (xhr.status === 401) {
        redirectToLoginIfNeeded()
        reject(new Error('未授权'))
        return
      }
      if (xhr.status === 413) {
        reject(new Error('单文件不超过 64MB'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhrMessage(xhr)))
        return
      }
      resolve(normalizeFileInfo(parseXhrJson(xhr)))
    }
    xhr.send(form)
  })
}

function putBlobWithProgress(
  url: string,
  blob: Blob,
  onPartProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPartProgress(e.loaded)
    }
    xhr.onerror = () => reject(new Error('分片网络错误'))
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`分片上传失败（${xhr.status}）`))
        return
      }
      const etag = normalizeEtag(xhr.getResponseHeader('ETag'))
      if (!etag) {
        reject(new Error('分片响应缺少 ETag'))
        return
      }
      resolve(etag)
    }
    xhr.send(blob)
  })
}

async function putPartWithRetries(
  url: string,
  blob: Blob,
  onPartProgress: (loaded: number) => void,
): Promise<string> {
  let last: unknown
  for (let i = 0; i < PART_ATTEMPTS; i++) {
    try {
      return await putBlobWithProgress(url, blob, onPartProgress)
    } catch (e) {
      last = e
      if (i === PART_ATTEMPTS - 1) break
    }
  }
  throw last instanceof Error ? last : new Error('分片上传失败')
}

export interface UseFileUploadOptions {
  onUploaded?: () => void
}

export interface UseFileUploadResult {
  items: UploadQueueItem[]
  enqueue: (
    files: File[],
    meta: { semantic_type: string; folder_path: string; tags: string[] },
  ) => void
  retry: (clientId: string) => void
  dismiss: (clientId: string) => void
  clearFinished: () => void
}

export function useFileUpload(options?: UseFileUploadOptions): UseFileUploadResult {
  const onUploadedRef = useRef(options?.onUploaded)
  const uploadNotifAskedRef = useRef(false)
  useEffect(() => {
    onUploadedRef.current = options?.onUploaded
  }, [options?.onUploaded])

  const [items, setItems] = useState<UploadQueueItem[]>([])

  const patchItem = useCallback((clientId: string, patch: Partial<UploadQueueItem>) => {
    setItems((prev) => prev.map((x) => (x.clientId === clientId ? { ...x, ...patch } : x)))
  }, [])

  const runUpload = useCallback(
    (clientId: string, meta: Omit<UploadQueueItem, 'clientId' | 'status' | 'progress'>) => {
      const { file, semantic_type, folder_path, tags } = meta

      const exec = async () => {
        patchItem(clientId, { status: 'uploading', progress: 0, errorMessage: undefined })

        if (file.size > MAX_FILE_BYTES) {
          throw new Error('单文件不超过 64MB')
        }

        if (file.size <= SMALL_UPLOAD_MAX_BYTES) {
          const info = await withRetries('直传', async () => {
            const form = new FormData()
            form.append('file', file)
            form.append('semantic_type', semantic_type.trim())
            form.append('folder_path', folder_path)
            if (tags.length) {
              form.append('tags', JSON.stringify(tags))
            }
            return postFormWithProgress('/api/files/upload', form, (pct) => {
              patchItem(clientId, { progress: pct })
            })
          })
          patchItem(clientId, { status: 'success', progress: 100, resultId: info.id })
          toast.success(`已上传：${file.name}`)
          notifyUploadResult(true, file.name)
          onUploadedRef.current?.()
          return
        }

        const st = semantic_type.trim() || null
        const initBody = {
          filename: file.name,
          original_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          size: file.size,
          semantic_type: st === null ? '' : st,
          folder_path,
          tags,
        }

        const { upload_id, r2_key, part_urls } = await withRetries('初始化分片', () =>
          initiateMultipart(initBody),
        )

        const partCount = part_urls.length
        const parts: { etag: string; partNumber: number }[] = []
        let uploadedBytes = 0

        for (let i = 0; i < partCount; i++) {
          const start = i * MULTIPART_PART_BYTES
          const end = Math.min(file.size, start + MULTIPART_PART_BYTES)
          const blob = file.slice(start, end)
          const url = part_urls[i]
          if (!url) throw new Error('分片 URL 缺失')

          const etag = await putPartWithRetries(url, blob, (loaded) => {
            const base = uploadedBytes + loaded
            const pct = Math.min(99, Math.round((100 * base) / file.size))
            patchItem(clientId, { progress: pct })
          })

          parts.push({ etag, partNumber: i + 1 })
          uploadedBytes += blob.size
        }

        patchItem(clientId, { progress: 99 })

        await withRetries('完成分片', () =>
          completeMultipart({
            upload_id,
            r2_key,
            parts,
            original_name: file.name,
            mime_type: file.type || 'application/octet-stream',
            size: file.size,
            semantic_type: st,
            folder_path,
            tags: tags.length ? tags : null,
          }),
        )

        patchItem(clientId, { status: 'success', progress: 100 })
        toast.success(`已上传：${file.name}`)
        notifyUploadResult(true, file.name)
        onUploadedRef.current?.()
      }

      void exec().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : '上传失败'
        patchItem(clientId, { status: 'error', errorMessage: msg, progress: 0 })
        toast.error(`${file.name}：${msg}`)
        notifyUploadResult(false, file.name)
      })
    },
    [patchItem],
  )

  const enqueue = useCallback(
    (fileList: File[], meta: { semantic_type: string; folder_path: string; tags: string[] }) => {
      if (!uploadNotifAskedRef.current) {
        uploadNotifAskedRef.current = true
        void requestUploadNotificationPermission()
      }
      const rows: UploadQueueItem[] = fileList.map((f) => ({
        clientId: crypto.randomUUID(),
        file: f,
        semantic_type: meta.semantic_type,
        folder_path: meta.folder_path,
        tags: meta.tags,
        status: 'pending',
        progress: 0,
      }))
      setItems((prev) => [...prev, ...rows])
      for (const row of rows) {
        runUpload(row.clientId, {
          file: row.file,
          semantic_type: row.semantic_type,
          folder_path: row.folder_path,
          tags: row.tags,
        })
      }
    },
    [runUpload],
  )

  const retry = useCallback(
    (clientId: string) => {
      let snap: Pick<UploadQueueItem, 'file' | 'semantic_type' | 'folder_path' | 'tags'> | null =
        null
      setItems((prev) => {
        const row = prev.find((x) => x.clientId === clientId)
        if (!row || row.status === 'uploading') return prev
        snap = {
          file: row.file,
          semantic_type: row.semantic_type,
          folder_path: row.folder_path,
          tags: row.tags,
        }
        return prev.map((x) =>
          x.clientId === clientId
            ? { ...x, status: 'pending', progress: 0, errorMessage: undefined }
            : x,
        )
      })
      if (snap) {
        queueMicrotask(() => runUpload(clientId, snap!))
      }
    },
    [runUpload],
  )

  const dismiss = useCallback((clientId: string) => {
    setItems((prev) => prev.filter((x) => x.clientId !== clientId))
  }, [])

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((x) => x.status !== 'success' && x.status !== 'error'))
  }, [])

  return { items, enqueue, retry, dismiss, clearFinished }
}
