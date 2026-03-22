import { useCallback, useEffect, useRef, useState } from 'react'

import { useUiStore } from '@/store/uiStore'

const dockTooltipClass =
  'pointer-events-none absolute z-30 whitespace-nowrap rounded-md bg-slate-900/95 px-2 py-1 text-xs font-medium text-white shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:bg-slate-700/95'

function IconFolder(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-7.5a1.75 1.75 0 00-1.75-1.75h-4.672a.75.75 0 01-.53-.22L9.897 3.225A.75.75 0 009.25 3H3.75z" />
    </svg>
  )
}

function IconChevronUp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M9.47 6.47a.75.75 0 011.06 0l4.25 4.25a.75.75 0 11-1.06 1.06L10 8.06 6.34 11.78a.75.75 0 01-1.06-1.06l4.25-4.25z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function IconChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

const LS_HEIGHT = 'chat-workspace-dock-height-px'
const COLLAPSED_H = 44
const MIN_EXPANDED = 200
const DEFAULT_EXPANDED = 320
const MAX_RATIO = 0.78

function readSavedHeight(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_EXPANDED
  const n = Number(localStorage.getItem(LS_HEIGHT))
  return Number.isFinite(n) && n >= MIN_EXPANDED ? n : DEFAULT_EXPANDED
}

export default function ChatWorkspaceDock({ children }: { children: React.ReactNode }) {
  const collapsed = useUiStore((s) => s.workspaceDockCollapsed)
  const setCollapsed = useUiStore((s) => s.setWorkspaceDockCollapsed)
  const toggleWorkspaceDock = useUiStore((s) => s.toggleWorkspaceDock)

  const [heightPx, setHeightPx] = useState(readSavedHeight)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => {
    localStorage.setItem(LS_HEIGHT, String(heightPx))
  }, [heightPx])

  const maxH = useCallback(() => {
    if (typeof window === 'undefined') return 640
    return Math.max(MIN_EXPANDED, Math.floor(window.innerHeight * MAX_RATIO))
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = { startY: e.clientY, startH: heightPx }
    },
    [collapsed, heightPx],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const delta = d.startY - e.clientY
      const next = Math.min(maxH(), Math.max(MIN_EXPANDED, d.startH + delta))
      setHeightPx(next)
    },
    [maxH],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      dragRef.current = null
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setHeightPx((h) => Math.min(h, maxH()))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [maxH])

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden border-t border-slate-200/90 bg-white/95 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] dark:border-cyan-500/20 dark:bg-slate-950/90 dark:shadow-[0_-4px_28px_rgba(0,0,0,0.35)]"
      style={{ height: collapsed ? COLLAPSED_H : heightPx }}
    >
      {collapsed ? (
        <div className="group relative w-full shrink-0">
          <button
            type="button"
            aria-label="展开工作空间面板"
            onClick={() => setCollapsed(false)}
            className="flex h-11 w-full items-center gap-2 border-b border-transparent px-4 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80"
            aria-expanded={false}
          >
            <IconFolder className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <span className="bg-gradient-to-r from-emerald-800 to-emerald-700 bg-clip-text font-semibold text-transparent dark:from-emerald-200 dark:to-emerald-300">
              工作空间
            </span>
            <span className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 dark:text-slate-400">
              <IconChevronUp className="h-5 w-5" />
            </span>
          </button>
          <span className={`${dockTooltipClass} right-3 bottom-full mb-1`} role="tooltip">
            点击展开
          </span>
        </div>
      ) : (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="拖拽调整工作空间高度"
            tabIndex={0}
            className="flex h-3 shrink-0 cursor-ns-resize items-center justify-center border-b border-slate-200/80 bg-slate-100/80 dark:border-slate-700/60 dark:bg-slate-900/50"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHeightPx((h) => Math.min(maxH(), h + 16))
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHeightPx((h) => Math.max(MIN_EXPANDED, h - 16))
              }
            }}
          >
            <span className="h-1 w-14 shrink-0 rounded-full bg-slate-400/70 dark:bg-slate-500/80" />
          </div>
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-emerald-500/15 px-3 dark:border-emerald-500/10">
            <h2 className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-100/95">
              工作空间
            </h2>
            <div className="group relative shrink-0">
              <button
                type="button"
                onClick={() => toggleWorkspaceDock()}
                aria-label="收起"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/35 bg-emerald-50 text-emerald-900 transition-colors hover:bg-emerald-100/90 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
                aria-expanded
              >
                <IconChevronDown className="h-4 w-4" />
              </button>
              <span className={`${dockTooltipClass} right-0 bottom-full mb-1`} role="tooltip">
                收起
              </span>
            </div>
          </div>
        </>
      )}
      {/*
        收起时仍挂载子树（仅 hidden），避免卸载导致：
        - 上传队列 state 丢失、XHR 进度回调 setState 到已卸载组件
        - 索引进度模拟 useProcessingProgress 从 0 重来（纯 UI，但易误解为重复上传）
      */}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1 sm:px-3 ${collapsed ? 'hidden' : ''}`}
        aria-hidden={collapsed}
      >
        {children}
      </div>
    </div>
  )
}
