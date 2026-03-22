/** processed: 0 处理中，1 已索引，-1 失败（与后端一致） */
export type FileProcessed = 0 | 1 | -1

/**
 * 与 `GET /api/workspace` 列表项及 `GET /api/workspace/events` 中 `file_status` / `snapshot` 载荷对齐。
 */
export interface FileInfo {
  id: string
  original_name: string
  mime_type: string
  size: number
  semantic_type: string
  folder_path: string
  tags: string[]
  processed: FileProcessed
  /** 索引失败时服务端返回的说明；成功或非失败为空 */
  process_error?: string | null
  created_at: number
}

export interface InitMultipartResponse {
  upload_id: string
  r2_key: string
  part_urls: string[]
}

/** POST /api/files/complete-multipart 与后端 CompleteMultipartInput 一致 */
export interface CompleteMultipartBody {
  upload_id: string
  r2_key: string
  parts: { etag: string; partNumber: number }[]
  original_name: string
  mime_type: string
  size: number
  semantic_type?: string | null
  folder_path?: string
  tags?: string[] | null
}

/** 与后端 DIRECT_UPLOAD / MULTIPART_PART 对齐（技术方案 §11） */
export const MAX_FILE_BYTES = 64 * 1024 * 1024
export const SMALL_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const MULTIPART_PART_BYTES = 5 * 1024 * 1024
