import { useCallback, useEffect, useMemo, useState } from 'react'

import { FolderChevronToggle, TREE_CHILD_NEST_CLASS } from '@/components/files/FolderTreeChevron'
import { fileControlClass, fileLabelClass } from '@/lib/file-workspace-theme'
import {
  buildFolderTree,
  collectFolderPrefixes,
  lastSegment,
  parentFolderPath,
  pathPrefixes,
  pathSegments,
  type FolderTreeNode,
} from '@/lib/folder-tree-utils'
import type { FileInfo } from '@/types/file'

function mergePrefixChains(paths: Iterable<string>): Set<string> {
  const s = new Set<string>()
  for (const raw of paths) {
    const p = raw.trim()
    if (!p) continue
    const parts = p.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      s.add(acc)
    }
  }
  return s
}

/** 展示用：根目录 → 各段 */
function folderBreadcrumbLabels(storagePath: string): string[] {
  const t = storagePath.trim()
  if (!t) return ['根目录']
  return ['根目录', ...pathSegments(t)]
}

function FolderSubtree({
  nodes,
  selectedPath,
  virtualSet,
  editingPath,
  editingDraft,
  collapsed,
  onToggleCollapsed,
  onSelectPath,
  onStartEditVirtual,
  onEditingDraftChange,
  onCommitEdit,
  onCancelEdit,
  disabled,
}: {
  nodes: FolderTreeNode[]
  selectedPath: string
  virtualSet: Set<string>
  editingPath: string | null
  editingDraft: string
  collapsed: Set<string>
  onToggleCollapsed: (path: string) => void
  onSelectPath: (path: string) => void
  onStartEditVirtual: (path: string) => void
  onEditingDraftChange: (v: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  disabled?: boolean
}) {
  return (
    <ul className="mt-0.5 space-y-0.5" role="group">
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0
        const expanded = hasChildren && !collapsed.has(n.path)
        return (
          <li key={n.path} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
            {editingPath === n.path ? (
              <div className="flex items-center gap-1 py-0.5 pr-1">
                <span className="w-7 shrink-0" aria-hidden />
                <span className="shrink-0 text-xs opacity-80" aria-hidden>
                  📁
                </span>
                <input
                  type="text"
                  autoFocus
                  disabled={disabled}
                  className={`min-w-0 flex-1 py-0.5 text-[11px] ${fileControlClass}`}
                  value={editingDraft}
                  onChange={(e) => onEditingDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onCommitEdit()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      onCancelEdit()
                    }
                  }}
                  onBlur={() => onCommitEdit()}
                />
              </div>
            ) : (
              <div className="group/row flex items-center gap-0.5">
                <div className="flex min-w-0 flex-1 items-center rounded-md transition-colors">
                  {hasChildren ? (
                    <FolderChevronToggle
                      expanded={expanded}
                      disabled={disabled}
                      onToggle={() => onToggleCollapsed(n.path)}
                    />
                  ) : (
                    <span className="w-7 shrink-0" aria-hidden />
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      selectedPath === n.path
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
                {virtualSet.has(n.path) ? (
                  <button
                    type="button"
                    disabled={disabled}
                    title="修改名称"
                    className="shrink-0 rounded px-1 py-0.5 text-[10px] text-slate-500 opacity-0 transition hover:text-emerald-200 group-hover/row:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onStartEditVirtual(n.path)
                    }}
                  >
                    改名
                  </button>
                ) : null}
              </div>
            )}
            {hasChildren && expanded ? (
              <div className={TREE_CHILD_NEST_CLASS}>
                <FolderSubtree
                  nodes={n.children}
                  selectedPath={selectedPath}
                  virtualSet={virtualSet}
                  editingPath={editingPath}
                  editingDraft={editingDraft}
                  collapsed={collapsed}
                  onToggleCollapsed={onToggleCollapsed}
                  onSelectPath={onSelectPath}
                  onStartEditVirtual={onStartEditVirtual}
                  onEditingDraftChange={onEditingDraftChange}
                  onCommitEdit={onCommitEdit}
                  onCancelEdit={onCancelEdit}
                  disabled={disabled}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export interface UploadFolderPickerProps {
  /** 弹窗批次变化时清空本地新建的虚拟目录状态 */
  resetKey: string
  files: FileInfo[]
  value: string
  onChange: (folderPath: string) => void
  disabled?: boolean
}

/**
 * 上传弹窗内：树状选目录；可在选中节点下新建文件夹（默认「新文件夹」），虚拟目录可改名。
 */
export default function UploadFolderPicker({
  resetKey,
  files,
  value,
  onChange,
  disabled,
}: UploadFolderPickerProps) {
  const [virtualPaths, setVirtualPaths] = useState<string[]>([])
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  useEffect(() => {
    setVirtualPaths([])
    setEditingPath(null)
    setEditingDraft('')
    setCollapsed(new Set())
  }, [resetKey])

  const fromFiles = useMemo(() => collectFolderPrefixes(files), [files])

  const valueChain = useMemo(() => mergePrefixChains(value.trim() ? [value.trim()] : []), [value])

  const allPrefixes = useMemo(() => {
    const s = new Set(fromFiles)
    for (const p of mergePrefixChains(virtualPaths)) s.add(p)
    for (const p of valueChain) s.add(p)
    return s
  }, [fromFiles, valueChain, virtualPaths])

  const tree = useMemo(() => buildFolderTree(allPrefixes), [allPrefixes])
  const virtualSet = useMemo(() => new Set(virtualPaths), [virtualPaths])

  const selectedPath = value

  /** 保证从根到选中项的各级父节点均展开（含折叠操作后仍保持选中可见） */
  useEffect(() => {
    const t = selectedPath.trim()
    if (!t) return
    setCollapsed((prev) => {
      const next = new Set(prev)
      const ancestors = pathPrefixes(t).slice(0, -1)
      let changed = false
      for (const p of ancestors) {
        if (next.has(p)) {
          next.delete(p)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedPath, collapsed])

  const pickUniqueChildName = useCallback(
    (parentPath: string, base: string): string => {
      const tryName = (name: string) => (parentPath ? `${parentPath}/${name}` : name)
      let name = base
      let full = tryName(name)
      let n = 2
      while (allPrefixes.has(full) || virtualPaths.includes(full)) {
        name = `${base} (${n})`
        full = tryName(name)
        n += 1
      }
      return full
    },
    [allPrefixes, virtualPaths],
  )

  const handleCreateSubfolder = useCallback(() => {
    const parent = selectedPath.trim()
    const full = pickUniqueChildName(parent, '新文件夹')
    setVirtualPaths((prev) => [...prev, full])
    onChange(full)
    setEditingPath(full)
  }, [onChange, pickUniqueChildName, selectedPath])

  const commitRename = useCallback(() => {
    if (!editingPath) return
    if (!virtualSet.has(editingPath)) {
      setEditingPath(null)
      return
    }
    const raw = editingDraft.trim().replace(/[/\\]/g, '').replace(/^\.+$/, '')
    if (!raw) {
      setEditingPath(null)
      return
    }
    const parent = parentFolderPath(editingPath)
    const nextFull = parent ? `${parent}/${raw}` : raw
    if (nextFull === editingPath) {
      setEditingPath(null)
      return
    }
    const taken =
      fromFiles.has(nextFull) ||
      virtualPaths.some((p) => p === nextFull && p !== editingPath)
    if (taken) {
      setEditingPath(null)
      return
    }

    const oldP = editingPath
    const newP = nextFull
    setVirtualPaths((prev) => {
      const next = prev.map((p) => {
        if (p === oldP) return newP
        if (p.startsWith(`${oldP}/`)) return `${newP}${p.slice(oldP.length)}`
        return p
      })
      return [...new Set(next)]
    })

    if (selectedPath === oldP) {
      onChange(newP)
    } else if (selectedPath.startsWith(`${oldP}/`)) {
      onChange(`${newP}${selectedPath.slice(oldP.length)}`)
    }
    setEditingPath(null)
  }, [
    editingDraft,
    editingPath,
    fromFiles,
    onChange,
    selectedPath,
    virtualPaths,
    virtualSet,
  ])

  const cancelEdit = useCallback(() => {
    setEditingPath(null)
  }, [])

  useEffect(() => {
    if (!editingPath) return
    setEditingDraft(lastSegment(editingPath))
  }, [editingPath])

  const breadcrumbParts = useMemo(() => folderBreadcrumbLabels(selectedPath), [selectedPath])

  return (
    <div className="space-y-2">
      <span className={fileLabelClass}>保存目录</span>
      <div
        className="max-h-52 overflow-y-auto rounded-lg border border-emerald-500/30 bg-slate-50 p-2 dark:border-emerald-500/20 dark:bg-slate-950/50"
        role="group"
        aria-label="选择保存目录"
      >
        <button
          type="button"
          disabled={disabled}
          className={`flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors disabled:opacity-45 ${
            selectedPath === ''
              ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-500/50 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-500/35'
              : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/55 dark:hover:text-slate-100'
          }`}
          onClick={() => onChange('')}
        >
          <span className="shrink-0 opacity-85" aria-hidden>
            📂
          </span>
          <span>根目录</span>
        </button>
        {tree.length ? (
          <FolderSubtree
            nodes={tree}
            selectedPath={selectedPath}
            virtualSet={virtualSet}
            editingPath={editingPath}
            editingDraft={editingDraft}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onSelectPath={onChange}
            onStartEditVirtual={(p) => {
              setEditingPath(p)
              setEditingDraft(lastSegment(p))
            }}
            onEditingDraftChange={setEditingDraft}
            onCommitEdit={commitRename}
            onCancelEdit={cancelEdit}
            disabled={disabled}
          />
        ) : (
          <p className="px-1 py-2 text-[11px] text-slate-500">
            暂无已有子目录；可选「根目录」或点击下方新建文件夹。
          </p>
        )}
      </div>
      <div className="text-[11px] leading-relaxed text-slate-500">
        <span className="block text-slate-400">当前选择（自根目录起的完整路径）</span>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 pl-4 font-mono text-[11px] sm:pl-5">
          {breadcrumbParts.map((seg, i) => (
            <span key={`${i}-${seg}`} className="inline-flex items-center">
              {i > 0 ? <span className="mx-1 text-slate-600">/</span> : null}
              <span
                className={
                  i === breadcrumbParts.length - 1
                    ? 'text-emerald-200/95'
                    : i === 0
                      ? 'text-slate-400'
                      : 'text-slate-300'
                }
              >
                {seg}
              </span>
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="w-full rounded-md border border-emerald-500/35 bg-emerald-950/30 px-2 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-950/50 disabled:opacity-45"
        onClick={handleCreateSubfolder}
      >
        在选中目录下新建文件夹
      </button>
      <p className="text-[11px] text-slate-500">
        新建文件夹仅用于本次上传路径；默认名称「新文件夹」，可在树中点「改名」或创建后直接编辑。
      </p>
    </div>
  )
}
