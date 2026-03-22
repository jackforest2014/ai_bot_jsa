/**
 * IndexedDB 封装：集中 DB 名、版本与 upgrade，供文件列表缓存等复用（阶段六 6.3）。
 */
import { openDB, type IDBPDatabase } from 'idb'

export const FILES_CACHE_DB_NAME = 'ai-bot-files-cache'
export const FILES_CACHE_DB_VERSION = 1
export const FILES_LIST_OBJECT_STORE = 'file_lists'

let filesCacheDb: Promise<IDBPDatabase> | null = null

/** 文件列表缓存库（与 `files-list-cache` 使用同一 store） */
export function openFilesListCacheDB(): Promise<IDBPDatabase> {
  if (!filesCacheDb) {
    filesCacheDb = openDB(FILES_CACHE_DB_NAME, FILES_CACHE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FILES_LIST_OBJECT_STORE)) {
          db.createObjectStore(FILES_LIST_OBJECT_STORE)
        }
      },
    })
  }
  return filesCacheDb
}

/** IndexedDB 读写在隐私模式 / 配额下可能抛错，用于吞掉并回退 */
export async function idbTry<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}
