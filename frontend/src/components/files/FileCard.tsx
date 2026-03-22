import type { FileInfo } from '@/types/file'

import { useProcessingProgress } from '@/hooks/useProcessingProgress'
import { filePanelClass } from '@/lib/file-workspace-theme'
import { semanticTypeLabel } from '@/lib/semantic-types'
import { formatDateTime, formatFileSize } from '@/lib/utils'

function processedLabel(p: FileInfo['processed']): { text: string; className: string } {
  if (p === 1) {
    return {
      text: '已索引',
      className: 'bg-emerald-950/55 text-emerald-200 ring-1 ring-emerald-500/40',
    }
  }
  if (p === -1) {
    return {
      text: '处理失败',
      className: 'bg-red-950/50 text-red-200 ring-1 ring-red-500/35',
    }
  }
  return {
    text: '处理中',
    className: 'bg-amber-950/45 text-amber-100 ring-1 ring-amber-500/35',
  }
}

function createdAtMs(createdAt: number): number {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return 0
  return createdAt < 1e12 ? createdAt * 1000 : createdAt
}

function FileMeta({ file, timeLabel }: { file: FileInfo; timeLabel: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-500">
        {formatFileSize(file.size)} · {file.mime_type || '未知类型'}
      </p>
      <p className="text-xs text-slate-400">
        上传时间：<span className="text-slate-200">{timeLabel}</span>
      </p>
      <p className="text-xs text-slate-400">
        目录：<span className="font-mono text-emerald-200/85">{file.folder_path || '（根）'}</span>
      </p>
      <p className="text-xs text-slate-400">
        语义类型：
        <span className="text-slate-200">{semanticTypeLabel(file.semantic_type)}</span>
      </p>
      {file.processed === -1 ? (
        <p className="text-xs text-red-300/90">
          {file.process_error?.trim() ? (
            <>
              <span className="font-medium text-red-200/95">失败原因：</span>
              <span className="break-words">{file.process_error.trim()}</span>
            </>
          ) : (
            <span className="text-slate-500">未返回具体原因（可尝试重新处理或查看服务端日志）。</span>
          )}
        </p>
      ) : null}
      {file.tags.length ? (
        <p className="text-xs text-slate-400">
          标签：<span className="text-slate-200">{file.tags.join(', ')}</span>
        </p>
      ) : null}
    </div>
  )
}

function FileActions({
  file,
  busy,
  onRename,
  onDelete,
  onDownload,
  onEditMeta,
  onRetryProcess,
}: {
  file: FileInfo
  busy?: boolean
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onEditMeta: (file: FileInfo) => void
  onRetryProcess?: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      <button
        type="button"
        disabled={busy}
        className="rounded border border-slate-600/80 bg-slate-900/60 px-2 py-1 text-xs font-medium text-slate-200 hover:border-emerald-500/35 hover:text-emerald-100 disabled:opacity-50"
        onClick={() => onDownload(file.id)}
      >
        下载
      </button>
      <button
        type="button"
        disabled={busy}
        className="rounded border border-slate-600/80 bg-slate-900/60 px-2 py-1 text-xs font-medium text-slate-200 hover:border-emerald-500/35 hover:text-emerald-100 disabled:opacity-50"
        onClick={() => onRename(file.id)}
      >
        重命名
      </button>
      <button
        type="button"
        disabled={busy}
        className="rounded border border-slate-600/80 bg-slate-900/60 px-2 py-1 text-xs font-medium text-slate-200 hover:border-emerald-500/35 hover:text-emerald-100 disabled:opacity-50"
        onClick={() => onEditMeta(file)}
      >
        类型与标签
      </button>
      {file.processed === -1 && onRetryProcess ? (
        <button
          type="button"
          disabled={busy}
          className="rounded border border-amber-500/40 bg-amber-950/45 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-950/65 disabled:opacity-50"
          onClick={() => onRetryProcess(file.id)}
        >
          重新处理
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="rounded border border-red-500/40 bg-red-950/35 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-950/55 disabled:opacity-50"
        onClick={() => onDelete(file.id)}
      >
        删除
      </button>
    </div>
  )
}

/** 处理中：顶部动态进度条 + 随百分比变化的背景渐变（进度为前端估算，列表轮询对齐真实状态） */
function FileCardChrome({
  fileId,
  processed,
  className,
  children,
}: {
  fileId: string
  processed: FileInfo['processed']
  className: string
  children: React.ReactNode
}) {
  const pct = useProcessingProgress(fileId, processed)
  const processing = processed === 0
  const displayPct = Math.min(100, Math.round(pct))

  return (
    <article className={`relative overflow-hidden ${className}`}>
      {processing ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
            style={{
              opacity: 0.44,
              background: `linear-gradient(128deg,
                rgba(251, 191, 36, ${0.14 + pct * 0.002}) 0%,
                rgba(15, 23, 42, 0.9) ${Math.min(96, 35 + pct * 0.5)}%,
                rgba(52, 211, 153, ${0.08 + pct * 0.0022}) 100%)`,
            }}
          />
          <div
            className="absolute left-0 right-0 top-0 z-[1] h-1.5 overflow-hidden rounded-t-[inherit] bg-slate-950/90"
            role="progressbar"
            aria-valuenow={displayPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="索引进度（估算，完成以状态标签为准）"
          >
            <div
              className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-emerald-400 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="pointer-events-none absolute right-2 top-2 z-[1] rounded border border-amber-500/30 bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums tracking-tight text-amber-100">
            {displayPct}%
          </div>
        </>
      ) : null}
      <div className={processing ? 'relative z-[2] pt-5' : 'relative z-[2]'}>{children}</div>
    </article>
  )
}

export interface FileCardProps {
  file: FileInfo
  layout?: 'grid' | 'list'
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onEditMeta: (file: FileInfo) => void
  onRetryProcess?: (id: string) => void
  busy?: boolean
}

export default function FileCard({
  file,
  layout = 'grid',
  onRename,
  onDelete,
  onDownload,
  onEditMeta,
  onRetryProcess,
  busy,
}: FileCardProps) {
  const badge = processedLabel(file.processed)
  const ts = createdAtMs(file.created_at)
  const timeLabel = ts > 0 ? formatDateTime(ts) : '—'

  if (layout === 'list') {
    return (
      <FileCardChrome
        fileId={file.id}
        processed={file.processed}
        className={`flex flex-col gap-3 md:flex-row md:items-start md:justify-between ${filePanelClass}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:gap-6">
          <div className="flex min-w-0 items-start justify-between gap-2 md:block md:w-56 md:shrink-0">
            <h3
              className="line-clamp-2 text-sm font-semibold text-slate-100"
              title={file.original_name}
            >
              {file.original_name}
            </h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium md:mt-2 ${badge.className}`}
            >
              {badge.text}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <FileMeta file={file} timeLabel={timeLabel} />
          </div>
        </div>
        <div className="shrink-0 border-t border-emerald-500/15 pt-3 md:w-52 md:border-l md:border-emerald-500/15 md:border-t-0 md:pl-4 md:pt-0">
          <FileActions
            file={file}
            busy={busy}
            onRename={onRename}
            onDelete={onDelete}
            onDownload={onDownload}
            onEditMeta={onEditMeta}
            onRetryProcess={onRetryProcess}
          />
        </div>
      </FileCardChrome>
    )
  }

  return (
    <FileCardChrome
      fileId={file.id}
      processed={file.processed}
      className={`flex flex-col ${filePanelClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="line-clamp-2 text-sm font-semibold text-slate-100"
          title={file.original_name}
        >
          {file.original_name}
        </h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.text}
        </span>
      </div>
      <div className="mt-1">
        <FileMeta file={file} timeLabel={timeLabel} />
      </div>
      <div className="mt-3">
        <FileActions
          file={file}
          busy={busy}
          onRename={onRename}
          onDelete={onDelete}
          onDownload={onDownload}
          onEditMeta={onEditMeta}
          onRetryProcess={onRetryProcess}
        />
      </div>
    </FileCardChrome>
  )
}
