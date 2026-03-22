import type { FileInfo } from '@/types/file'

export type FolderTreeNode = {
  segment: string
  path: string
  children: FolderTreeNode[]
}

/** 从已存在文件的 `folder_path` 收集所有前缀路径（含中间目录） */
export function collectFolderPrefixes(files: FileInfo[]): Set<string> {
  const set = new Set<string>()
  for (const f of files) {
    const fp = (f.folder_path ?? '').trim()
    if (!fp) continue
    const parts = fp.split('/').filter(Boolean)
    let acc = ''
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p
      set.add(acc)
    }
  }
  return set
}

export function buildFolderTree(prefixes: Set<string>): FolderTreeNode[] {
  const sorted = [...prefixes].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const roots: FolderTreeNode[] = []

  const ensurePath = (nodes: FolderTreeNode[], fullPath: string): void => {
    const parts = fullPath.split('/').filter(Boolean)
    if (!parts.length) return
    let level = nodes
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      acc = i === 0 ? parts[0] : `${acc}/${parts[i]}`
      const seg = parts[i]
      let child = level.find((n) => n.segment === seg && n.path === acc)
      if (!child) {
        child = { segment: seg, path: acc, children: [] }
        level.push(child)
        level.sort((a, b) => a.segment.localeCompare(b.segment, 'zh-CN'))
      }
      if (i === parts.length - 1) break
      level = child.children
    }
  }

  for (const p of sorted) ensurePath(roots, p)
  return roots
}

export function parentFolderPath(fullPath: string): string {
  const t = fullPath.trim()
  if (!t) return ''
  const i = t.lastIndexOf('/')
  return i === -1 ? '' : t.slice(0, i)
}

export function lastSegment(fullPath: string): string {
  const t = fullPath.trim()
  if (!t) return ''
  const parts = t.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** 自根到该路径的各段（不含空根），如 `a/b` → `['a','b']` */
export function pathSegments(fullPath: string): string[] {
  return fullPath.trim().split('/').filter(Boolean)
}

/** 从根到 `fullPath` 的每一级前缀，如 `a/b/c` → `['a','a/b','a/b/c']` */
export function pathPrefixes(fullPath: string): string[] {
  const parts = pathSegments(fullPath)
  const out: string[] = []
  let acc = ''
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p
    out.push(acc)
  }
  return out
}
