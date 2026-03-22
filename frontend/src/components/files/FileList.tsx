import { useState } from 'react'

import type { FileInfo } from '@/types/file'

import FileCard from '@/components/files/FileCard'

export interface FileListProps {
  files: FileInfo[]
  /** 无数据时的提示（例如本地搜索无匹配） */
  emptyMessage?: string
  loading: boolean
  error: string | null
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onEditMeta: (file: FileInfo) => void
  onRetryProcess?: (id: string) => void
  busyId?: string | null
}

type ViewMode = 'grid' | 'list'

export default function FileList({
  files,
  emptyMessage,
  loading,
  error,
  onRename,
  onDelete,
  onDownload,
  onEditMeta,
  onRetryProcess,
  busyId,
}: FileListProps) {
  const [view, setView] = useState<ViewMode>('grid')

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/35 bg-red-950/35 px-3 py-2 text-sm text-red-200">
        {error}
      </div>
    )
  }

  if (loading && files.length === 0) {
    return <p className="text-sm text-slate-400">加载中…</p>
  }

  if (files.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage ?? '暂无文件。'}</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-slate-500">共 {files.length} 个文件</span>
        <div
          className="inline-flex rounded-lg border border-emerald-500/25 bg-slate-950/60 p-0.5"
          role="group"
          aria-label="列表视图"
        >
          <button
            type="button"
            aria-pressed={view === 'grid'}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              view === 'grid'
                ? 'bg-emerald-800/80 text-emerald-50 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
            }`}
            onClick={() => setView('grid')}
          >
            网格
          </button>
          <button
            type="button"
            aria-pressed={view === 'list'}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              view === 'list'
                ? 'bg-emerald-800/80 text-emerald-50 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
            }`}
            onClick={() => setView('list')}
          >
            列表
          </button>
        </div>
      </div>

      <ul
        className={
          view === 'grid'
            ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
            : 'flex flex-col gap-2'
        }
      >
        {files.map((f) => (
          <li key={f.id}>
            <FileCard
              file={f}
              layout={view}
              onRename={onRename}
              onDelete={onDelete}
              onDownload={onDownload}
              onEditMeta={onEditMeta}
              onRetryProcess={onRetryProcess}
              busy={busyId === f.id}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
