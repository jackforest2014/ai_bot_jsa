import type { FileInfo } from '@/types/file'

import {
  FILES_LIST_OBJECT_STORE,
  idbTry,
  openFilesListCacheDB,
} from '@/lib/idb'

/** 与 `useFiles` 查询字段一致，避免循环依赖 */
export type FilesListCacheQuery = {
  folder?: string
  type?: string
}

interface CachedEntry {
  list: FileInfo[]
  storedAt: number
}

/** 与任务 5.8 / 6.3 一致：缓存的是 `GET /api/workspace` 响应；按 folder + type 区分 key，避免陈旧数据混用 */
export function filesListCacheKey(q: FilesListCacheQuery): string {
  const folderPart =
    q.folder === undefined ? '__all__' : q.folder === '' ? '__root__' : encodeURIComponent(q.folder)
  const typePart = q.type?.trim() ? encodeURIComponent(q.type.trim()) : '__any__'
  return `${folderPart}::${typePart}`
}

export async function readFilesListCache(key: string): Promise<FileInfo[] | null> {
  return idbTry(async () => {
    const d = await openFilesListCacheDB()
    const row = (await d.get(FILES_LIST_OBJECT_STORE, key)) as CachedEntry | undefined
    return row?.list ?? null
  }, null)
}

export async function writeFilesListCache(key: string, list: FileInfo[]): Promise<void> {
  await idbTry(async () => {
    const d = await openFilesListCacheDB()
    await d.put(FILES_LIST_OBJECT_STORE, { list, storedAt: Date.now() } satisfies CachedEntry, key)
  }, undefined)
}

/** 上传、重命名、删改元数据后清空，避免与服务器不一致（任务 5.8 / 6.3） */
export async function clearFilesListCache(): Promise<void> {
  await idbTry(async () => {
    const d = await openFilesListCacheDB()
    await d.clear(FILES_LIST_OBJECT_STORE)
  }, undefined)
}
