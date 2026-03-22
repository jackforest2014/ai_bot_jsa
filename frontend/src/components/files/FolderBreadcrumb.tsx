export interface FolderBreadcrumbProps {
  /** `undefined`：不按目录筛选；`''`：根目录；否则为当前前缀路径 */
  folder: string | undefined
  onNavigate: (folder: string | undefined) => void
}

export default function FolderBreadcrumb({ folder, onNavigate }: FolderBreadcrumbProps) {
  if (folder === undefined) {
    return (
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-400" aria-label="目录">
        <button
          type="button"
          className="rounded px-2 py-0.5 font-medium text-emerald-800 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-950 dark:text-emerald-200/90 dark:decoration-emerald-500/40 dark:hover:text-emerald-100"
          onClick={() => onNavigate(undefined)}
        >
          全部文件
        </button>
      </nav>
    )
  }

  if (folder === '') {
    return (
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-400" aria-label="目录">
        <button
          type="button"
          className="text-slate-600 hover:text-emerald-800 dark:text-slate-500 dark:hover:text-emerald-300/90"
          onClick={() => onNavigate(undefined)}
        >
          全部文件
        </button>
        <span className="text-slate-500 dark:text-slate-600">/</span>
        <span className="font-medium text-slate-900 dark:text-slate-100">根目录</span>
      </nav>
    )
  }

  const segments = folder.split('/').filter(Boolean)

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-400" aria-label="目录">
      <button
        type="button"
        className="text-slate-600 hover:text-emerald-800 dark:text-slate-500 dark:hover:text-emerald-300/90"
        onClick={() => onNavigate(undefined)}
      >
        全部文件
      </button>
      <span className="text-slate-500 dark:text-slate-600">/</span>
      <button
        type="button"
        className="text-slate-600 hover:text-emerald-800 dark:text-slate-500 dark:hover:text-emerald-300/90"
        onClick={() => onNavigate('')}
      >
        根目录
      </button>
      {segments.map((seg, i) => {
        const path = segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        return (
          <span key={path} className="flex items-center gap-1">
            <span className="text-slate-500 dark:text-slate-600">/</span>
            {isLast ? (
              <span className="font-medium text-slate-900 dark:text-slate-100">{seg}</span>
            ) : (
              <button
                type="button"
                className="text-slate-600 hover:text-emerald-800 dark:text-slate-500 dark:hover:text-emerald-300/90"
                onClick={() => onNavigate(path)}
              >
                {seg}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
