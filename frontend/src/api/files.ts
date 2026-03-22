/**
 * 工作空间文件 API（与后端路由拆分一致）：
 * - **列表与实时更新**：`GET /api/workspace`、`GET /api/workspace/events`（SSE）
 * - **上传与单文件操作**：仍走 `POST|PUT|DELETE /api/files/...`（根路径 `GET /api/files` 已移除）
 */
import { ApiError, apiUrl, authHeaders, request } from '@/api/client'
import type { FileInfo, FileProcessed, InitMultipartResponse } from '@/types/file'

export function normalizeFileInfo(raw: unknown): FileInfo {
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      original_name: '',
      mime_type: '',
      size: 0,
      semantic_type: '',
      folder_path: '',
      tags: [],
      processed: 0,
      process_error: null,
      created_at: 0,
    }
  }
  const o = raw as Record<string, unknown>
  const tagsRaw = o.tags
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map((x) => String(x)) : []
  const proc = typeof o.processed === 'number' ? o.processed : 0
  const pe = o.process_error
  const process_error =
    pe === null || pe === undefined
      ? null
      : typeof pe === 'string' && pe.trim()
        ? pe.trim()
        : null
  return {
    id: typeof o.id === 'string' ? o.id : '',
    original_name: typeof o.original_name === 'string' ? o.original_name : '',
    mime_type: typeof o.mime_type === 'string' ? o.mime_type : '',
    size: typeof o.size === 'number' ? o.size : 0,
    semantic_type: typeof o.semantic_type === 'string' ? o.semantic_type : '',
    folder_path: typeof o.folder_path === 'string' ? o.folder_path : '',
    tags,
    processed: proc as FileProcessed,
    process_error,
    created_at: typeof o.created_at === 'number' ? o.created_at : 0,
  }
}

export function buildWorkspaceListQuery(q?: { folder?: string; type?: string }): string {
  const p = new URLSearchParams()
  if (q?.folder !== undefined) p.set('folder', q.folder)
  if (q?.type?.trim()) p.set('type', q.type.trim())
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

/** 工作空间文件列表（`GET /api/workspace`，查询参数 `folder` / `type` 与后端一致） */
export async function listWorkspaceFiles(q?: { folder?: string; type?: string }): Promise<FileInfo[]> {
  const rows = await request<unknown[]>(`/api/workspace${buildWorkspaceListQuery(q)}`)
  return Array.isArray(rows) ? rows.map(normalizeFileInfo) : []
}

export type WorkspaceSseHandlers = {
  onSnapshot?: (files: FileInfo[]) => void
  onFileStatus?: (file: FileInfo) => void
  onFileRemoved?: (id: string) => void
  onProcessingIdle?: () => void
  onError?: (message: string) => void
}

function parseSseBlock(block: string, handlers: WorkspaceSseHandlers): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (!dataLines.length) return
  let payload: unknown
  try {
    payload = JSON.parse(dataLines.join('\n')) as unknown
  } catch {
    return
  }
  const o = payload as Record<string, unknown>
  switch (event) {
    case 'snapshot': {
      const filesRaw = o.files
      if (!Array.isArray(filesRaw)) return
      handlers.onSnapshot?.(filesRaw.map(normalizeFileInfo))
      break
    }
    case 'file_status': {
      const f = o.file
      if (!f || typeof f !== 'object') return
      handlers.onFileStatus?.(normalizeFileInfo(f))
      break
    }
    case 'file_removed': {
      const id = typeof o.id === 'string' ? o.id : ''
      if (id) handlers.onFileRemoved?.(id)
      break
    }
    case 'processing_idle':
      handlers.onProcessingIdle?.()
      break
    case 'error': {
      const msg = typeof o.message === 'string' ? o.message : 'workspace_events_error'
      handlers.onError?.(msg)
      break
    }
    default:
      break
  }
}

/**
 * `GET /api/workspace/events`（SSE）。失败时由调用方回退到静默轮询。
 */
export async function streamWorkspaceFileEvents(
  q: { folder?: string; type?: string } | undefined,
  signal: AbortSignal,
  handlers: WorkspaceSseHandlers,
): Promise<void> {
  const url = apiUrl(`/api/workspace/events${buildWorkspaceListQuery(q)}`)
  const res = await fetch(url, { signal, headers: authHeaders() })
  if (res.status === 401) {
    throw new ApiError('未授权，请重新登录', 401)
  }
  if (!res.ok) {
    const text = await res.text()
    let message = '请求失败'
    try {
      const j = JSON.parse(text) as { error?: string }
      if (typeof j.error === 'string') message = j.error
    } catch {
      if (text) message = text
    }
    throw new ApiError(message, res.status)
  }
  if (!res.body) {
    throw new ApiError('无响应体', res.status)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let sep: number
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      if (block.trim()) parseSseBlock(block, handlers)
    }
  }
}

export async function uploadSmall(form: FormData): Promise<FileInfo> {
  const raw = await request<unknown>('/api/files/upload', { method: 'POST', body: form })
  return normalizeFileInfo(raw)
}

export type InitiateMultipartBody = {
  filename: string
  original_name: string
  mime_type: string
  size: number
  semantic_type: string
  folder_path?: string
  tags?: string[]
}

export async function initiateMultipart(
  body: InitiateMultipartBody,
): Promise<InitMultipartResponse> {
  return request<InitMultipartResponse>('/api/files/initiate-multipart', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type CompleteMultipartBody = {
  upload_id: string
  r2_key: string
  parts: { etag: string; partNumber: number }[]
  original_name: string
  mime_type: string
  size: number
  semantic_type: string | null
  folder_path?: string
  tags?: string[] | null
}

export async function completeMultipart(
  body: CompleteMultipartBody,
): Promise<{ id: string; message?: string }> {
  return request<{ id: string; message?: string }>('/api/files/complete-multipart', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteFile(id: string): Promise<void> {
  await request(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function renameFile(id: string, new_name: string): Promise<FileInfo> {
  const raw = await request<unknown>(`/api/files/${encodeURIComponent(id)}/rename`, {
    method: 'PUT',
    body: JSON.stringify({ new_name }),
  })
  return normalizeFileInfo(raw)
}

export async function updateSemanticType(
  id: string,
  semantic_type: string | null,
): Promise<FileInfo> {
  const raw = await request<unknown>(`/api/files/${encodeURIComponent(id)}/semantic-type`, {
    method: 'PUT',
    body: JSON.stringify({ semantic_type }),
  })
  return normalizeFileInfo(raw)
}

export async function updateTags(id: string, tags: string[]): Promise<FileInfo> {
  const raw = await request<unknown>(`/api/files/${encodeURIComponent(id)}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  })
  return normalizeFileInfo(raw)
}

export async function getDownloadUrl(id: string): Promise<string> {
  const res = await request<{ url: string }>(`/api/files/${encodeURIComponent(id)}/download`)
  return res.url
}

/** 拉取签名 URL 并触发浏览器下载（任务 5.6） */
export async function triggerFileDownload(id: string, filename?: string): Promise<void> {
  const url = await getDownloadUrl(id)
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  if (filename?.trim()) a.download = filename.trim()
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function retryProcessFile(id: string): Promise<FileInfo> {
  const raw = await request<unknown>(`/api/files/${encodeURIComponent(id)}/retry-process`, {
    method: 'POST',
  })
  return normalizeFileInfo(raw)
}

export const filesAPI = {
  workspaceList: listWorkspaceFiles,
  uploadSmall,
  initiateMultipart,
  completeMultipart,
  delete: deleteFile,
  rename: renameFile,
  updateSemanticType,
  updateTags,
  download: getDownloadUrl,
  triggerDownload: triggerFileDownload,
  retryProcess: retryProcessFile,
}
