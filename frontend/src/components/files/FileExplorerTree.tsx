import { useCallback, useEffect, useMemo, useState } from 'react'

import FileCard from '@/components/files/FileCard'
import type { FolderFilterMode, FileSortKey } from '@/components/files/FileToolbar'
import { FolderChevronToggle, TREE_CHILD_NEST_CLASS } from '@/components/files/FolderTreeChevron'
import { filePanelClass } from '@/lib/file-workspace-theme'
import { compareFiles, groupFilesByFolderPath } from '@/lib/file-list-sort'
import {
  buildFolderTree,
  collectFolderPrefixes,
  pathPrefixes,
  type FolderTreeNode,
} from '@/lib/folder-tree-utils'
import type { FileInfo } from '@/types/file'

export interface FileExplorerTreeProps {
  files: FileInfo[]
  sortKey: FileSortKey
  folderMode: FolderFilterMode
  folderPrefix: string
  onNavigate: (folder: string | undefined) => void
  loading: boolean
  error: string | null
  emptyMessage?: string
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onEditMeta: (file: FileInfo) => void
  onRetryProcess?: (id: string) => void
  busyId?: string | null
}

function FileGroup({
  files: group,
  busyId,
  ...actions
}: {
  files: FileInfo[]
  busyId?: string | null
} & Pick<
  FileExplorerTreeProps,
  'onRename' | 'onDelete' | 'onDownload' | 'onEditMeta' | 'onRetryProcess'
>) {
  if (group.length === 0) return null
  return (
    <ul className="ml-6 space-y-1 border-l border-emerald-500/20 py-0.5 pl-2 dark:border-emerald-500/15">
      {group.map((f) => (
        <li key={f.id} className="w-fit max-w-full min-w-0">
          <FileCard
            file={f}
            layout="list"
            busy={busyId === f.id}
            onRename={actions.onRename}
            onDelete={actions.onDelete}
            onDownload={actions.onDownload}
            onEditMeta={actions.onEditMeta}
            onRetryProcess={actions.onRetryProcess}
          />
        </li>
      ))}
    </ul>
  )
}

function FolderSubtree({
  nodes,
  folderMode,
  folderPrefix,
  collapsed,
  filesByFolder,
  onToggleCollapsed,
  onSelectPath,
  busyId,
  ...actions
}: {
  nodes: FolderTreeNode[]
  folderMode: FolderFilterMode
  folderPrefix: string
  collapsed: Set<string>
  filesByFolder: Map<string, FileInfo[]>
  onToggleCollapsed: (path: string) => void
  onSelectPath: (path: string) => void
  busyId?: string | null
} & Pick<
  FileExplorerTreeProps,
  'onRename' | 'onDelete' | 'onDownload' | 'onEditMeta' | 'onRetryProcess'
>) {
  return (
    <ul className="mt-0.5 space-y-0.5" role="group">
      {nodes.map((n) => {
        const hasSubtree = n.children.length > 0
        const filesHere = filesByFolder.get(n.path) ?? []
        const hasFilesHere = filesHere.length > 0
        const canExpand = hasSubtree || hasFilesHere
        const expanded = canExpand && !collapsed.has(n.path)
        const selected = folderMode === 'prefix' && folderPrefix === n.path
        return (
          <li
            key={n.path}
            role="treeitem"
            aria-expanded={canExpand ? expanded : undefined}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex min-w-0 items-center rounded-md transition-colors">
                {canExpand ? (
                  <FolderChevronToggle
                    expanded={expanded}
                    onToggle={() => onToggleCollapsed(n.path)}
                  />
                ) : (
                  <span className="w-7 shrink-0" aria-hidden />
                )}
                <button
                  type="button"
                  className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md py-1 pl-0.5 pr-2 text-left text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/50 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-500/35'
                      : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/55 dark:hover:text-slate-100'
                  }`}
                  onClick={() => onSelectPath(n.path)}
                >
                  <span className="shrink-0 opacity-85" aria-hidden>
                    📁
                  </span>
                  <span className="min-w-0 truncate">{n.segment}</span>
                </button>
              </div>
              {expanded && hasFilesHere ? (
                <FileGroup files={filesHere} busyId={busyId} {...actions} />
              ) : null}
            </div>
            {hasSubtree && expanded ? (
              <div className={TREE_CHILD_NEST_CLASS}>
                <FolderSubtree
                  nodes={n.children}
                  folderMode={folderMode}
                  folderPrefix={folderPrefix}
                  collapsed={collapsed}
                  filesByFolder={filesByFolder}
                  onToggleCollapsed={onToggleCollapsed}
                  onSelectPath={onSelectPath}
                  busyId={busyId}
                  {...actions}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 树状展示目录 + 各目录下文件（与工具栏筛选后的 `files` 一致）
 */
export default function FileExplorerTree({
  files,
  sortKey,
  folderMode,
  folderPrefix,
  onNavigate,
  loading,
  error,
  emptyMessage,
  onRename,
  onDelete,
  onDownload,
  onEditMeta,
  onRetryProcess,
  busyId,
}: FileExplorerTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const filesByFolder = useMemo(() => {
    const m = groupFilesByFolderPath(files)
    for (const arr of m.values()) {
      arr.sort((a, b) => compareFiles(a, b, sortKey))
    }
    return m
  }, [files, sortKey])

  const rootFiles = filesByFolder.get('') ?? []

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
  }, [selectedStoragePath])

  const prefixes = useMemo(() => collectFolderPrefixes(files), [files])
  const tree = useMemo(() => buildFolderTree(prefixes), [prefixes])
  const hasRootOnly = useMemo(() => files.some((f) => !(f.folder_path ?? '').trim()), [files])

  const actions = useMemo(
    () => ({ onRename, onDelete, onDownload, onEditMeta, onRetryProcess }),
    [onRename, onDelete, onDownload, onEditMeta, onRetryProcess],
  )

  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col justify-center rounded-xl border border-red-300/80 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/35 dark:bg-red-950/35 dark:text-red-200">
        {error}
      </div>
    )
  }

  if (loading && files.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <p className="text-sm text-slate-600 dark:text-slate-400">加载中…</p>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <nav
        className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${filePanelClass}`}
        aria-label="文件浏览"
      >
        <h3 className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
          文件浏览
        </h3>
        <p className="min-h-0 flex-1 text-sm text-slate-600 dark:text-slate-400">
          {emptyMessage ?? '暂无文件。'}
        </p>
      </nav>
    )
  }

  return (
    <nav
      className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${filePanelClass}`}
      aria-label="文件浏览"
    >
      <h3 className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
        文件浏览
      </h3>
      <p className="mb-2 shrink-0 text-[11px] leading-snug text-slate-600 dark:text-slate-500">
        目录与文件一体展示；点击文件夹与上方「目录范围」筛选一致。
      </p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
        {folderMode === 'all' && rootFiles.length > 0 ? (
          <FileGroup files={rootFiles} busyId={busyId} {...actions} />
        ) : null}

        {hasRootOnly ? (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center">
              <span className="w-7 shrink-0" aria-hidden />
              <button
                type="button"
                className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md py-1 pl-0.5 pr-2 text-left text-sm font-medium transition-colors ${
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
            </div>
            {folderMode === 'root' && rootFiles.length > 0 ? (
              <FileGroup files={rootFiles} busyId={busyId} {...actions} />
            ) : null}
          </div>
        ) : null}

        {tree.length ? (
          <FolderSubtree
            nodes={tree}
            folderMode={folderMode}
            folderPrefix={folderPrefix}
            collapsed={collapsed}
            filesByFolder={filesByFolder}
            onToggleCollapsed={toggleCollapsed}
            onSelectPath={(path) => onNavigate(path)}
            busyId={busyId}
            {...actions}
          />
        ) : !hasRootOnly ? (
          <p className="px-1 py-2 text-[11px] text-slate-500">暂无子目录。</p>
        ) : null}
      </div>
    </nav>
  )
}
