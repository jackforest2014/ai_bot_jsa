/** processed: 0 处理中，1 已索引，-1 失败（与后端一致） */
export type FileProcessed = 0 | 1 | -1

/** 与 GET /api/files 等对齐 */
export interface FileInfo {
  id: string
  original_name: string
  mime_type: string
  size: number
  semantic_type: string
  folder_path: string
  tags: string[]
  processed: FileProcessed
  created_at: number
}

export interface InitMultipartResponse {
  upload_id: string
  r2_key: string
  part_urls: string[]
}
