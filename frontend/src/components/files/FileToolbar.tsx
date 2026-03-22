import { fileControlClass, fileLabelClass, filePanelClass } from '@/lib/file-workspace-theme'

export type FolderFilterMode = 'all' | 'root' | 'prefix'

/** 客户端列表排序（任务 5.7） */
export type FileSortKey = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc'

export interface FileToolbarProps {
  folderMode: FolderFilterMode
  folderPrefix: string
  typeFilter: string
  fileSearch: string
  sortKey: FileSortKey
  loading: boolean
  onFolderModeChange: (mode: FolderFilterMode) => void
  onFolderPrefixChange: (v: string) => void
  onTypeFilterChange: (v: string) => void
  onFileSearchChange: (v: string) => void
  onSortKeyChange: (v: FileSortKey) => void
  onRefresh: () => void
}

export default function FileToolbar({
  folderMode,
  folderPrefix,
  typeFilter,
  fileSearch,
  sortKey,
  loading,
  onFolderModeChange,
  onFolderPrefixChange,
  onTypeFilterChange,
  onFileSearchChange,
  onSortKeyChange,
  onRefresh,
}: FileToolbarProps) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end ${filePanelClass}`}
    >
      <label className={`flex min-w-[10rem] flex-col gap-1 ${fileLabelClass}`}>
        目录范围
        <select
          className={`w-full ${fileControlClass}`}
          value={folderMode}
          onChange={(e) => onFolderModeChange(e.target.value as FolderFilterMode)}
        >
          <option value="all">全部（不按目录过滤）</option>
          <option value="root">仅根目录</option>
          <option value="prefix">路径前缀</option>
        </select>
      </label>

      {folderMode === 'prefix' ? (
        <label className={`flex min-w-[12rem] flex-1 flex-col gap-1 ${fileLabelClass}`}>
          前缀路径
          <input
            type="text"
            className={`w-full ${fileControlClass}`}
            placeholder="例如 docs/notes"
            value={folderPrefix}
            onChange={(e) => onFolderPrefixChange(e.target.value)}
          />
        </label>
      ) : null}

      <label className={`flex min-w-[10rem] flex-1 flex-col gap-1 ${fileLabelClass}`}>
        语义类型（服务端筛选）
        <input
          type="text"
          className={`w-full ${fileControlClass}`}
          placeholder="英文 code，如 resume、knowledge"
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
        />
      </label>

      <label className={`flex min-w-[10rem] flex-1 flex-col gap-1 ${fileLabelClass}`}>
        文件名搜索
        <input
          type="search"
          className={`w-full ${fileControlClass}`}
          placeholder="本地筛选，输入后短暂停顿再过滤"
          value={fileSearch}
          onChange={(e) => onFileSearchChange(e.target.value)}
        />
      </label>

      <label className={`flex min-w-[9rem] flex-col gap-1 ${fileLabelClass}`}>
        排序
        <select
          className={`w-full ${fileControlClass}`}
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as FileSortKey)}
        >
          <option value="time_desc">时间 · 新→旧</option>
          <option value="time_asc">时间 · 旧→新</option>
          <option value="name_asc">名称 · A→Z</option>
          <option value="name_desc">名称 · Z→A</option>
          <option value="size_desc">大小 · 大→小</option>
          <option value="size_asc">大小 · 小→大</option>
        </select>
      </label>

      <button
        type="button"
        disabled={loading}
        className="rounded-md border border-emerald-500/40 bg-gradient-to-r from-emerald-800 to-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:from-emerald-700 hover:to-emerald-600 disabled:cursor-not-allowed disabled:border-slate-600 disabled:from-slate-700 disabled:to-slate-700 disabled:shadow-none"
        onClick={() => void onRefresh()}
      >
        {loading ? '刷新中…' : '刷新列表'}
      </button>
    </div>
  )
}
