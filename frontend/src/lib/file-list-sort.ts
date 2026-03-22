import type { FileSortKey } from '@/components/files/FileToolbar'
import type { FileInfo } from '@/types/file'

export function compareFiles(a: FileInfo, b: FileInfo, sortKey: FileSortKey): number {
  switch (sortKey) {
    case 'time_desc':
      return b.created_at - a.created_at
    case 'time_asc':
      return a.created_at - b.created_at
    case 'name_asc':
      return a.original_name.localeCompare(b.original_name, 'zh-CN')
    case 'name_desc':
      return b.original_name.localeCompare(a.original_name, 'zh-CN')
    case 'size_desc':
      return b.size - a.size
    case 'size_asc':
      return a.size - b.size
    default:
      return 0
  }
}

/** 按目录路径分组；每组内顺序未定义，由调用方再 sort */
export function groupFilesByFolderPath(files: FileInfo[]): Map<string, FileInfo[]> {
  const m = new Map<string, FileInfo[]>()
  for (const f of files) {
    const k = (f.folder_path ?? '').trim()
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(f)
  }
  return m
}
