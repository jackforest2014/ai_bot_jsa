import { useCallback, useEffect, useRef, useState } from 'react'

import { filesAPI, streamWorkspaceFileEvents } from '@/api/files'
import {
  filesListCacheKey,
  readFilesListCache,
  writeFilesListCache,
  type FilesListCacheQuery,
} from '@/lib/files-list-cache'
import type { FileInfo } from '@/types/file'

export type { FilesListCacheQuery }

function isLikelyNetworkFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true
  if (e instanceof Error && e.name === 'AbortError') return true
  const msg = e instanceof Error ? e.message : String(e)
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('网络错误')
  )
}

export interface UseFilesOptions {
  enabled?: boolean
  /** 任务 5.8 / 6.3：列表写入 IndexedDB，切换 folder/type 用不同 key */
  cacheList?: boolean
}

export interface UseFilesResult {
  files: FileInfo[]
  loading: boolean
  error: string | null
  /** 最近一次拉取失败但展示了 IndexedDB 缓存（通常为离线或网络异常） */
  fromCacheOnly: boolean
  /** `quiet`: 轮询时用，不触发全表 loading、失败时保持当前列表 */
  refresh: (opts?: { quiet?: boolean }) => Promise<void>
  removeLocal: (id: string) => void
  upsertLocal: (file: FileInfo) => void
}

/**
 * `GET /api/workspace` 与本地列表状态；可选 IndexedDB 缓存（任务 5.8 / 6.3）。
 * 上传队列由 `useFileUpload` 负责，成功后由页面 `clearFilesListCache` + `refresh` 失效缓存（列表请求为 `GET /api/workspace`）。
 * 存在 `processed===0` 时优先订阅 `GET /api/workspace/events`（SSE）；连接失败或断开后回退为每 2.5s `refresh({ quiet: true })`。
 */
export function useFiles(
  query: FilesListCacheQuery,
  options?: UseFilesOptions,
): UseFilesResult {
  const enabled = options?.enabled ?? true
  const cacheList = options?.cacheList ?? true

  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fromCacheOnly, setFromCacheOnly] = useState(false)
  const filesRef = useRef<FileInfo[]>([])
  filesRef.current = files

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!enabled) return
    const quiet = opts?.quiet ?? false
    if (!quiet) {
      setLoading(true)
      setError(null)
    }
    const key = filesListCacheKey(query)

    if (!quiet) {
      if (cacheList) {
        const cached = await readFilesListCache(key)
        setFiles(cached ?? [])
        setFromCacheOnly(false)
      } else {
        setFiles([])
        setFromCacheOnly(false)
      }
    }

    try {
      const list = await filesAPI.workspaceList({
        ...(query.folder !== undefined ? { folder: query.folder } : {}),
        ...(query.type?.trim() ? { type: query.type.trim() } : {}),
      })
      setFiles(list)
      setFromCacheOnly(false)
      if (cacheList) await writeFilesListCache(key, list)
    } catch (e) {
      if (!quiet) {
        const msg = e instanceof Error ? e.message : '加载文件列表失败'
        if (cacheList && isLikelyNetworkFailure(e)) {
          const cached = await readFilesListCache(key)
          if (cached?.length) {
            setFiles(cached)
            setFromCacheOnly(true)
            setError(null)
          } else {
            setError(msg)
            setFromCacheOnly(false)
          }
        } else {
          setError(msg)
          setFromCacheOnly(false)
        }
      }
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [enabled, cacheList, query])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasPendingProcessing = files.some((f) => f.processed === 0)

  const backupPollRef = useRef<number | undefined>(undefined)
  const startBackupPoll = useCallback(() => {
    if (backupPollRef.current != null) return
    backupPollRef.current = window.setInterval(() => {
      void refresh({ quiet: true })
    }, 2500)
  }, [refresh])

  const clearBackupPoll = useCallback(() => {
    if (backupPollRef.current != null) {
      clearInterval(backupPollRef.current)
      backupPollRef.current = undefined
    }
  }, [])

  useEffect(() => {
    if (!enabled || !hasPendingProcessing) {
      clearBackupPoll()
      return
    }

    const ac = new AbortController()
    let cancelled = false
    const key = filesListCacheKey(query)
    const q = {
      ...(query.folder !== undefined ? { folder: query.folder } : {}),
      ...(query.type?.trim() ? { type: query.type.trim() } : {}),
    }

    void streamWorkspaceFileEvents(q, ac.signal, {
      onSnapshot: (list) => {
        setFiles(list)
        setFromCacheOnly(false)
        if (cacheList) void writeFilesListCache(key, list)
      },
      onFileStatus: (file) => {
        setFiles((prev) => {
          const i = prev.findIndex((x) => x.id === file.id)
          const next =
            i === -1 ? [file, ...prev] : (() => { const n = [...prev]; n[i] = file; return n })()
          if (cacheList) void writeFilesListCache(key, next)
          return next
        })
      },
      onFileRemoved: (id) => {
        setFiles((prev) => {
          const next = prev.filter((f) => f.id !== id)
          if (cacheList) void writeFilesListCache(key, next)
          return next
        })
      },
      onProcessingIdle: () => {},
      onError: () => {},
    })
      .catch(() => {
        if (!ac.signal.aborted && !cancelled) startBackupPoll()
      })
      .finally(() => {
        if (ac.signal.aborted || cancelled) return
        if (filesRef.current.some((f) => f.processed === 0)) startBackupPoll()
      })

    return () => {
      cancelled = true
      ac.abort()
      clearBackupPoll()
    }
  }, [
    enabled,
    hasPendingProcessing,
    cacheList,
    query,
    refresh,
    startBackupPoll,
    clearBackupPoll,
  ])

  const removeLocal = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const upsertLocal = useCallback((file: FileInfo) => {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === file.id)
      if (i === -1) return [file, ...prev]
      const next = [...prev]
      next[i] = file
      return next
    })
  }, [])

  return { files, loading, error, fromCacheOnly, refresh, removeLocal, upsertLocal }
}
