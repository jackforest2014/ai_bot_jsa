import { useUiStore } from '@/store/uiStore'

export default function Header() {
  const globalLoading = useUiStore((s) => s.globalLoading)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <header className="relative border-b border-slate-200 bg-white px-4 py-3">
      {globalLoading ? (
        <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-slate-900/30" aria-hidden />
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => toggleSidebar()}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          {sidebarCollapsed ? '»' : '«'}
        </button>
        <h1 className="text-lg font-semibold text-slate-900">AI Bot</h1>
      </div>
    </header>
  )
}
