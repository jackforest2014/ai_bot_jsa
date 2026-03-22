import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import type { FileInfo } from '@/types/file'

import FileTypeIcon from '@/components/files/FileTypeIcon'
import { useProcessingProgress } from '@/hooks/useProcessingProgress'
import { semanticTypeLabel } from '@/lib/semantic-types'
import { formatDateTime, formatFileSize } from '@/lib/utils'

const fileCardDarkShadow =
  'dark:shadow-[inset_0_1px_0_rgba(52,211,153,0.06),0_12px_40px_rgba(0,0,0,0.35)]'

/** 索引进度等状态：细描边 + 半透明底；荧光仅向内（inset shadow，范围收小） */
function processedChrome(p: FileInfo['processed']): { ariaStatus: string; borderClass: string } {
  if (p === 1) {
    return {
      ariaStatus: '已索引',
      borderClass:
        'border border-emerald-400/85 bg-white/35 shadow-[inset_0_0_6px_rgba(34,197,94,0.45),inset_0_0_12px_rgba(52,211,153,0.12)] dark:border-emerald-400/60 dark:bg-slate-950/25 dark:shadow-[inset_0_0_6px_rgba(52,211,153,0.4),inset_0_0_10px_rgba(52,211,153,0.1)]',
    }
  }
  if (p === -1) {
    return {
      ariaStatus: '处理失败',
      borderClass:
        'border border-red-400/80 bg-white/35 shadow-[inset_0_0_6px_rgba(239,68,68,0.4),inset_0_0_11px_rgba(248,113,113,0.1)] dark:border-red-400/55 dark:bg-slate-950/25 dark:shadow-[inset_0_0_6px_rgba(248,113,113,0.35),inset_0_0_10px_rgba(248,113,113,0.08)]',
    }
  }
  return {
    ariaStatus: '处理中',
    borderClass:
      'border border-amber-400/80 bg-white/35 shadow-[inset_0_0_6px_rgba(245,158,11,0.42),inset_0_0_11px_rgba(251,191,36,0.1)] dark:border-amber-400/55 dark:bg-slate-950/25 dark:shadow-[inset_0_0_6px_rgba(251,191,36,0.35),inset_0_0_10px_rgba(251,191,36,0.08)]',
  }
}

function createdAtMs(createdAt: number): number {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return 0
  return createdAt < 1e12 ? createdAt * 1000 : createdAt
}

function FileMetaDetails({ file, timeLabel }: { file: FileInfo; timeLabel: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-600 dark:text-slate-500">{file.mime_type || '未知类型'}</p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        上传时间：<span className="text-slate-900 dark:text-slate-200">{timeLabel}</span>
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        目录：
        <span className="font-mono text-emerald-800 dark:text-emerald-200/85">
          {file.folder_path || '（根）'}
        </span>
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        语义类型：
        <span className="text-slate-900 dark:text-slate-200">{semanticTypeLabel(file.semantic_type)}</span>
      </p>
      {file.processed === -1 ? (
        <p className="text-xs text-red-700 dark:text-red-300/90">
          {file.process_error?.trim() ? (
            <>
              <span className="font-medium text-red-800 dark:text-red-200/95">失败原因：</span>
              <span className="break-words">{file.process_error.trim()}</span>
            </>
          ) : (
            <span className="text-slate-600 dark:text-slate-500">
              未返回具体原因（可尝试重新处理或查看服务端日志）。
            </span>
          )}
        </p>
      ) : null}
      {file.tags.length ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          标签：<span className="text-slate-900 dark:text-slate-200">{file.tags.join(', ')}</span>
        </p>
      ) : null}
    </div>
  )
}

function FileDetailsFloatingPanel({
  open,
  anchorRef,
  ariaStatus,
  file,
  timeLabel,
}: {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  ariaStatus: string
  file: FileInfo
  timeLabel: string
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const el = anchorRef.current
    if (!el) {
      setPos(null)
      return
    }
    const r = el.getBoundingClientRect()
    const maxW = Math.min(22 * 16, typeof window !== 'undefined' ? window.innerWidth - 16 : 352)
    let left = r.left
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400
    if (left + maxW > vw - 8) left = vw - 8 - maxW
    if (left < 8) left = 8
    setPos({ top: r.bottom + 6, left, width: maxW })
  }, [open, anchorRef, file.id])

  if (!open || !pos) return null

  return createPortal(
    <div
      className="pointer-events-none fixed z-[190] rounded-xl border border-emerald-500/35 bg-white/95 p-3 text-left shadow-xl backdrop-blur-md dark:border-emerald-500/25 dark:bg-slate-950/95"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <p className="mb-2 text-xs font-medium text-emerald-800 dark:text-emerald-200/90">{ariaStatus}</p>
      <FileMetaDetails file={file} timeLabel={timeLabel} />
      <p className="mt-2 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
        右键可打开下载、重命名等菜单
      </p>
    </div>,
    document.body,
  )
}

function FileContextMenuPortal({
  x,
  y,
  file,
  busy,
  onClose,
  onRename,
  onDelete,
  onDownload,
  onEditMeta,
  onRetryProcess,
}: {
  x: number
  y: number
  file: FileInfo
  busy?: boolean
  onClose: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDownload: (id: string) => void
  onEditMeta: (file: FileInfo) => void
  onRetryProcess?: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let onDoc: ((e: MouseEvent) => void) | undefined
    const t = window.setTimeout(() => {
      onDoc = (e: MouseEvent) => {
        if (ref.current?.contains(e.target as Node)) return
        onClose()
      }
      document.addEventListener('mousedown', onDoc, true)
    }, 0)
    return () => {
      window.clearTimeout(t)
      if (onDoc) document.removeEventListener('mousedown', onDoc, true)
    }
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = (fn: () => void) => {
    fn()
    onClose()
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600
  const menuW = 168
  const menuH = 220
  const left = Math.min(Math.max(8, x), vw - menuW - 8)
  const top = Math.min(Math.max(8, y), vh - menuH - 8)

  const itemClass =
    'flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-45 dark:text-slate-100 dark:hover:bg-emerald-500/20'

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="文件操作"
      className="fixed z-[200] min-w-[10.5rem] rounded-lg border border-emerald-500/35 bg-white/98 py-1 shadow-xl backdrop-blur-md dark:border-emerald-500/25 dark:bg-slate-950/98"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className={itemClass}
        onClick={() => run(() => onDownload(file.id))}
      >
        下载
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className={itemClass}
        onClick={() => run(() => onRename(file.id))}
      >
        重命名
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className={itemClass}
        onClick={() => run(() => onEditMeta(file))}
      >
        类型与标签
      </button>
      {file.processed === -1 && onRetryProcess ? (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          className={itemClass}
          onClick={() => run(() => onRetryProcess(file.id))}
        >
          重新处理
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className={`${itemClass} text-red-700 hover:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15`}
        onClick={() => run(() => onDelete(file.id))}
      >
        删除
      </button>
    </div>,
    document.body,
  )
}

export type FileCardProgressSlot = { processing: boolean; displayPct: number }

/** 处理中：整张卡片区域为进度条（底色 + 左向右填充），保留随进度变化的渐变氛围 */
function FileCardChrome({
  fileId,
  processed,
  className,
  ariaLabel,
  children,
}: {
  fileId: string
  processed: FileInfo['processed']
  className: string
  ariaLabel: string
  children: (slot: FileCardProgressSlot) => ReactNode
}) {
  const pct = useProcessingProgress(fileId, processed)
  const processing = processed === 0
  const displayPct = Math.min(100, Math.round(pct))

  return (
    <article className={`relative overflow-hidden ${className}`} aria-label={ariaLabel}>
      {processing ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
            style={{
              opacity: 0.42,
              background: `linear-gradient(128deg,
                rgba(251, 191, 36, ${0.12 + pct * 0.0018}) 0%,
                rgba(15, 23, 42, 0.9) ${Math.min(96, 32 + pct * 0.45)}%,
                rgba(52, 211, 153, ${0.06 + pct * 0.002}) 100%)`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-slate-200/70 dark:bg-slate-950/78"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-0 top-0 z-[2] h-full overflow-hidden rounded-[inherit]"
            style={{ width: `${Math.min(100, pct)}%` }}
            role="progressbar"
            aria-valuenow={displayPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="索引进度（估算，完成以状态为准）"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-amber-400/88 via-yellow-400/78 to-emerald-400/85" />
            <div
              className="absolute inset-0"
              style={{
                opacity: 0.5,
                background: `linear-gradient(135deg,
                  rgba(251, 191, 36, ${0.28 + pct * 0.002}) 0%,
                  rgba(52, 211, 153, ${0.18 + pct * 0.002}) 100%)`,
              }}
            />
          </div>
        </>
      ) : null}
      <div className="relative z-[3]">{children({ processing, displayPct })}</div>
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
  const { ariaStatus, borderClass } = processedChrome(file.processed)
  const ts = createdAtMs(file.created_at)
  const timeLabel = ts > 0 ? formatDateTime(ts) : '—'
  const ariaLabel = `${file.original_name}，${ariaStatus}`

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [hoverDetail, setHoverDetail] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  const processing = file.processed === 0
  /** 荧光描边与半透明底：仅处理中（上传/索引）或鼠标悬浮时 */
  const shellActive = processing || hoverDetail
  const neutralShell =
    'rounded-lg border border-slate-200/90 bg-white/95 shadow-sm dark:border-slate-600/45 dark:bg-slate-900/45'
  const glowShellClass = `rounded-lg ${borderClass} bg-white/90 shadow-sm backdrop-blur-sm dark:bg-slate-950/55 ${fileCardDarkShadow}`
  const cardSurfaceClass = shellActive ? glowShellClass : neutralShell
  const listShell = cardSurfaceClass
  const gridShell = `flex flex-col p-2 sm:p-2.5 ${cardSurfaceClass}`

  if (layout === 'list') {
    return (
      <div
        ref={anchorRef}
        className="relative w-fit max-w-full min-w-0"
        onMouseEnter={() => setHoverDetail(true)}
        onMouseLeave={() => setHoverDetail(false)}
      >
        <FileCardChrome
          fileId={file.id}
          processed={file.processed}
          ariaLabel={ariaLabel}
          className={listShell}
        >
          {({ processing, displayPct }) => (
            <div
              title="悬浮查看详情；右键打开操作菜单"
              className="flex w-fit max-w-full min-w-0 cursor-default items-center justify-between gap-2 px-2 py-1.5"
              onContextMenu={onContextMenu}
            >
              <div className="flex min-w-0 max-w-[min(100%,28rem)] items-center gap-1.5">
                <FileTypeIcon mimeType={file.mime_type} fileName={file.original_name} />
                <h3
                  className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-100"
                  title={file.original_name}
                >
                  {file.original_name}
                </h3>
              </div>
              <span className="shrink-0 tabular-nums text-[11px] text-slate-600 dark:text-slate-400">
                {formatFileSize(file.size)}
                {processing ? ` · ${displayPct}%` : ''}
              </span>
            </div>
          )}
        </FileCardChrome>
        <FileDetailsFloatingPanel
          open={hoverDetail}
          anchorRef={anchorRef}
          ariaStatus={ariaStatus}
          file={file}
          timeLabel={timeLabel}
        />
        {menu ? (
          <FileContextMenuPortal
            x={menu.x}
            y={menu.y}
            file={file}
            busy={busy}
            onClose={closeMenu}
            onRename={onRename}
            onDelete={onDelete}
            onDownload={onDownload}
            onEditMeta={onEditMeta}
            onRetryProcess={onRetryProcess}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={anchorRef}
      className="relative w-fit max-w-full justify-self-start"
      onMouseEnter={() => setHoverDetail(true)}
      onMouseLeave={() => setHoverDetail(false)}
    >
      <FileCardChrome
        fileId={file.id}
        processed={file.processed}
        ariaLabel={ariaLabel}
        className={gridShell}
      >
        {({ processing, displayPct }) => (
          <div
            title="悬浮查看详情；右键打开操作菜单"
            className="flex w-fit max-w-full min-w-0 flex-col gap-1.5"
            onContextMenu={onContextMenu}
          >
            <div className="flex w-fit max-w-full min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 max-w-[min(100%,20rem)] items-center gap-1.5">
                <FileTypeIcon mimeType={file.mime_type} fileName={file.original_name} />
                <h3
                  className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-100"
                  title={file.original_name}
                >
                  {file.original_name}
                </h3>
              </div>
              <span className="shrink-0 tabular-nums text-[11px] text-slate-600 dark:text-slate-400">
                {formatFileSize(file.size)}
                {processing ? ` · ${displayPct}%` : ''}
              </span>
            </div>
          </div>
        )}
      </FileCardChrome>
      <FileDetailsFloatingPanel
        open={hoverDetail}
        anchorRef={anchorRef}
        ariaStatus={ariaStatus}
        file={file}
        timeLabel={timeLabel}
      />
      {menu ? (
        <FileContextMenuPortal
          x={menu.x}
          y={menu.y}
          file={file}
          busy={busy}
          onClose={closeMenu}
          onRename={onRename}
          onDelete={onDelete}
          onDownload={onDownload}
          onEditMeta={onEditMeta}
          onRetryProcess={onRetryProcess}
        />
      ) : null}
    </div>
  )
}
