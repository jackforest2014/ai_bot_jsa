import { useCallback, useEffect, useState } from 'react'

import type { FolderFilterMode } from '@/components/files/FileToolbar'
import { FolderChevronToggle, TREE_CHILD_NEST_CLASS } from '@/components/files/FolderTreeChevron'
import { filePanelClass } from '@/lib/file-workspace-theme'
import {
  buildFolderTree,
  collectFolderPrefixes,
  pathPrefixes,
  type FolderTreeNode,
} from '@/lib/folder-tree-utils'
import type { FileInfo } from '@/types/file'

export interface FileFolderTreeProps {
  files: FileInfo[]
  folderMode: FolderFilterMode
  folderPrefix: string
  onNavigate: (folder: string | undefined) => void
}

export type { FolderTreeNode }

function FolderSubtree({
  nodes,
  folderMode,
  folderPrefix,
  collapsed,
  onToggleCollapsed,
  onSelectPath,
}: {
  nodes: FolderTreeNode[]
  folderMode: FolderFilterMode
  folderPrefix: string
  collapsed: Set<string>
  onToggleCollapsed: (path: string) => void
  onSelectPath: (path: string) => void
}) {
  return (
    <ul className="mt-0.5 space-y-0.5" role="group">
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0
        const expanded = hasChildren && !collapsed.has(n.path)
        const selected = folderMode === 'prefix' && folderPrefix === n.path
        return (
          <li key={n.path} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
            <div className="flex min-w-0 items-center rounded-md transition-colors">
              {hasChildren ? (
                <FolderChevronToggle
                  expanded={expanded}
                  onToggle={() => onToggleCollapsed(n.path)}
                />
              ) : (
                <span className="w-7 shrink-0" aria-hidden />
              )}
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors ${
                  selected
                    ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/50 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-500/35'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/55 dark:hover:text-slate-100'
                }`}
                onClick={() => onSelectPath(n.path)}
              >
                <span className="shrink-0 opacity-85" aria-hidden>
                  📁
                </span>
                <span className="min-w-0 truncate font-mono text-[11px]">{n.segment}</span>
              </button>
            </div>
            {hasChildren && expanded ? (
              <div className={TREE_CHILD_NEST_CLASS}>
                <FolderSubtree
                  nodes={n.children}
                  folderMode={folderMode}
                  folderPrefix={folderPrefix}
                  collapsed={collapsed}
                  onToggleCollapsed={onToggleCollapsed}
                  onSelectPath={onSelectPath}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** 左侧类资源管理器：按 folder_path 聚合目录，点击与面包屑 / 工具栏目录筛选一致 */
export default function FileFolderTree({
  files,
  folderMode,
  folderPrefix,
  onNavigate,
}: FileFolderTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const selectedStoragePath = folderMode === 'prefix' ? folderPrefix.trim() : ''

  useEffect(() => {
    if (!selectedStoragePath) return
    setCollapsed((prev) => {
      const next = new Set(prev)
      const ancestors = pathPrefixes(selectedStoragePath).slice(0, -1)
      let changed = false
      for (const p of ancestors) {
        if (next.has(p)) {
          next.delete(p)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedStoragePath, collapsed])

  if (!files.length) {
    return (
      <nav className={`${filePanelClass}`} aria-label="文件夹浏览">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
          文件夹
        </h3>
        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-500">
          尚无文件。上传后此处会按目录分层展示，便于像资源管理器一样浏览。
        </p>
      </nav>
    )
  }

  const prefixes = collectFolderPrefixes(files)
  const tree = buildFolderTree(prefixes)
  const hasRootOnly = files.some((f) => !(f.folder_path ?? '').trim())

  return (
    <nav className={`${filePanelClass}`} aria-label="文件夹浏览">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
        文件夹
      </h3>
      <p className="mb-2 text-[11px] leading-snug text-slate-600 dark:text-slate-500">
        点击目录与上方面包屑一致；有子目录时可点 ▸ 折叠或展开。
      </p>
      <div className="max-h-[min(22rem,50vh)] space-y-1 overflow-y-auto pr-1 lg:max-h-[min(32rem,calc(100vh-14rem))]">
        <div className="flex items-center">
          <span className="w-7 shrink-0" aria-hidden />
          <button
            type="button"
            className={`flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors ${
              folderMode === 'all'
                ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/50 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-500/35'
                : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/55 dark:hover:text-slate-100'
            }`}
            onClick={() => onNavigate(undefined)}
          >
            <span className="shrink-0 opacity-85" aria-hidden>
              🗂️
            </span>
            <span>全部文件</span>
          </button>
        </div>
        {hasRootOnly ? (
          <button
            type="button"
            className={`flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors ${
              folderMode === 'root'
                ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/50 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-500/35'
                : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/55 dark:hover:text-slate-100'
            }`}
            onClick={() => onNavigate('')}
          >
            <span className="shrink-0 opacity-85" aria-hidden>
              📂
            </span>
            <span>根目录</span>
          </button>
        ) : null}
        {tree.length ? (
          <FolderSubtree
            nodes={tree}
            folderMode={folderMode}
            folderPrefix={folderPrefix}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onSelectPath={(path) => onNavigate(path)}
          />
        ) : !hasRootOnly ? (
          <p className="px-1 py-2 text-[11px] text-slate-500">暂无子目录（文件均在根目录时可只选「全部」）。</p>
        ) : null}
      </div>
    </nav>
  )
}
