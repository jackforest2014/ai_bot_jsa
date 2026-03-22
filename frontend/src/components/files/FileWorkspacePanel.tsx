import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { filesAPI } from '@/api/files'
import FileExplorerTree from '@/components/files/FileExplorerTree'
import FileToolbar, {
  type FileSortKey,
  type FolderFilterMode,
} from '@/components/files/FileToolbar'
import SemanticTypeModal from '@/components/files/SemanticTypeModal'
import UploadDropzone from '@/components/files/UploadDropzone'
import UploadProgress from '@/components/files/UploadProgress'
import { useFiles, type FilesListCacheQuery } from '@/hooks/useFiles'
import { useFileUpload } from '@/hooks/useFileUpload'
import { compareFiles } from '@/lib/file-list-sort'
import { clearFilesListCache } from '@/lib/files-list-cache'
import { filePanelClass } from '@/lib/file-workspace-theme'
import type { FileInfo } from '@/types/file'

function listFolderFromUi(mode: FolderFilterMode, prefix: string): string | undefined {
  if (mode === 'all') return undefined
  if (mode === 'root') return ''
  return prefix.trim()
}

export interface FileWorkspacePanelProps {
  /** 未登录等情况下不拉取文件、展示占位 */
  disabled?: boolean
}

export default function FileWorkspacePanel({ disabled }: FileWorkspacePanelProps) {
  const [folderMode, setFolderMode] = useState<FolderFilterMode>('all')
  const [folderPrefix, setFolderPrefix] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fileSearch, setFileSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortKey, setSortKey] = useState<FileSortKey>('time_desc')

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadMetaOpen, setUploadMetaOpen] = useState(false)

  const [metaFile, setMetaFile] = useState<FileInfo | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(fileSearch.trim()), 300)
    return () => window.clearTimeout(t)
  }, [fileSearch])

  const filesQuery = useMemo(
    () => ({
      folder: listFolderFromUi(folderMode, folderPrefix),
      type: typeFilter.trim() || undefined,
    }),
    [folderMode, folderPrefix, typeFilter],
  )

  const fullListQuery = useMemo<FilesListCacheQuery>(() => ({}), [])

  const { files, loading, error, fromCacheOnly, refresh, removeLocal, upsertLocal } = useFiles(
    filesQuery,
    { enabled: !disabled },
  )

  const { files: explorerFiles, refresh: refreshExplorerTree } = useFiles(fullListQuery, {
    enabled: !disabled,
  })

  const refreshAll = useCallback(async () => {
    await clearFilesListCache()
    await Promise.all([refresh(), refreshExplorerTree()])
  }, [refresh, refreshExplorerTree])

  const uploadFolderPath = folderMode === 'prefix' ? folderPrefix.trim() : ''

  const { items, enqueue, retry, dismiss, clearFinished } = useFileUpload({
    onUploaded: () => {
      void refreshAll()
    },
  })

  const displayFiles = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    const rows = q
      ? files.filter((f) => f.original_name.toLowerCase().includes(q))
      : files.slice()
    rows.sort((a, b) => compareFiles(a, b, sortKey))
    return rows
  }, [files, debouncedSearch, sortKey])

  const listEmptyMessage =
    debouncedSearch && files.length > 0 ? '没有匹配的文件。' : undefined

  const navigateFolder = useCallback((folder: string | undefined) => {
    if (folder === undefined) {
      setFolderMode('all')
      return
    }
    if (folder === '') {
      setFolderMode('root')
      setFolderPrefix('')
      return
    }
    setFolderMode('prefix')
    setFolderPrefix(folder)
  }, [])

  const onPickFiles = useCallback((picked: File[]) => {
    setPendingFiles(picked)
    setUploadMetaOpen(true)
  }, [])

  const closeUploadMeta = useCallback(() => {
    setUploadMetaOpen(false)
    setPendingFiles([])
  }, [])

  const onUploadMetaConfirm = useCallback(
    (meta: { semantic_type: string; folder_path: string; tags: string[] }) => {
      const folder = meta.folder_path || uploadFolderPath
      enqueue(pendingFiles, {
        semantic_type: meta.semantic_type,
        folder_path: folder,
        tags: meta.tags,
      })
      closeUploadMeta()
    },
    [closeUploadMeta, enqueue, pendingFiles, uploadFolderPath],
  )

  const onRename = useCallback(
    async (id: string) => {
      const row = files.find((f) => f.id === id)
      if (!row) return
      const next = window.prompt('新文件名', row.original_name)
      if (next === null) return
      const trimmed = next.trim()
      if (!trimmed) {
        toast.error('名称不能为空')
        return
      }
      setBusyId(id)
      try {
        const updated = await filesAPI.rename(id, trimmed)
        upsertLocal(updated)
        await refreshAll()
        toast.success('已重命名')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '重命名失败')
      } finally {
        setBusyId(null)
      }
    },
    [files, refreshAll, upsertLocal],
  )

  const onDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('确定删除该文件？')) return
      setBusyId(id)
      try {
        await filesAPI.delete(id)
        removeLocal(id)
        await clearFilesListCache()
        toast.success('已删除')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '删除失败')
      } finally {
        setBusyId(null)
      }
    },
    [removeLocal],
  )

  const onDownload = useCallback(async (id: string) => {
    const row = files.find((f) => f.id === id)
    setBusyId(id)
    try {
      await filesAPI.triggerDownload(id, row?.original_name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败')
    } finally {
      setBusyId(null)
    }
  }, [files])

  const onRetryProcess = useCallback(
    async (id: string) => {
      setBusyId(id)
      try {
        const updated = await filesAPI.retryProcess(id)
        upsertLocal(updated)
        await refreshAll()
        toast.success('已重新排队处理')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '重试失败')
      } finally {
        setBusyId(null)
      }
    },
    [refreshAll, upsertLocal],
  )

  const onEditMeta = useCallback((f: FileInfo) => {
    setMetaFile(f)
    setMetaOpen(true)
  }, [])

  const onSaveMeta = useCallback(
    async (semanticType: string | null, tags: string[]) => {
      if (!metaFile) return
      setSavingMeta(true)
      try {
        await filesAPI.updateSemanticType(metaFile.id, semanticType)
        const updated = await filesAPI.updateTags(metaFile.id, tags)
        upsertLocal(updated)
        await refreshAll()
        toast.success('已更新类型与标签')
        setMetaOpen(false)
        setMetaFile(null)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败')
      } finally {
        setSavingMeta(false)
      }
    },
    [metaFile, refreshAll, upsertLocal],
  )

  if (disabled) {
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-emerald-500/30 bg-slate-50/80 px-4 text-center text-sm text-slate-500 dark:border-emerald-500/20 dark:bg-slate-900/40 dark:text-slate-400">
        登录后可使用工作空间（上传与文件浏览）
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {fromCacheOnly ? (
        <div className="shrink-0 rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/30 dark:text-amber-100">
          当前无法连接服务器，正在展示
          <strong className="mx-0.5 text-amber-900 dark:text-amber-50">本机缓存</strong>
          。网络恢复后请点击「刷新列表」。
        </div>
      ) : null}

      <FileToolbar
        folderMode={folderMode}
        folderPrefix={folderPrefix}
        typeFilter={typeFilter}
        fileSearch={fileSearch}
        sortKey={sortKey}
        loading={loading}
        onFolderModeChange={setFolderMode}
        onFolderPrefixChange={setFolderPrefix}
        onTypeFilterChange={setTypeFilter}
        onFileSearchChange={setFileSearch}
        onSortKeyChange={setSortKey}
        onRefresh={refreshAll}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:gap-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
          <FileExplorerTree
            files={displayFiles}
            sortKey={sortKey}
            folderMode={folderMode}
            folderPrefix={folderPrefix}
            onNavigate={navigateFolder}
            loading={loading}
            error={error}
            emptyMessage={listEmptyMessage}
            onRename={onRename}
            onDelete={onDelete}
            onDownload={onDownload}
            onEditMeta={onEditMeta}
            onRetryProcess={onRetryProcess}
            busyId={busyId}
          />
        </div>

        <div className="flex max-h-[40vh] min-h-0 w-full shrink-0 flex-col overflow-y-auto border-t border-emerald-500/15 pt-3 dark:border-emerald-500/10 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 xl:w-96">
          <section className={`space-y-3 ${filePanelClass}`}>
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-100/95">上传</h3>
            <p className="text-xs text-slate-600 dark:text-slate-500">
              当前上传目录：
              <span className="font-mono text-emerald-800 dark:text-emerald-200/80">
                {uploadFolderPath ? uploadFolderPath : '（根目录）'}
              </span>
              ；在上方「路径前缀」可设默认目录；也可在弹窗中单独指定。
            </p>
            <UploadDropzone onFiles={onPickFiles} disabled={false} />
            <UploadProgress
              items={items}
              onRetry={retry}
              onDismiss={dismiss}
              onClearFinished={clearFinished}
            />
          </section>
        </div>
      </div>

      <SemanticTypeModal
        variant="upload"
        open={uploadMetaOpen}
        fileNames={pendingFiles.map((f) => f.name)}
        explorerFiles={explorerFiles}
        defaultFolderPath={uploadFolderPath}
        onClose={closeUploadMeta}
        onConfirm={onUploadMetaConfirm}
      />

      <SemanticTypeModal
        variant="edit"
        open={metaOpen}
        file={metaFile}
        saving={savingMeta}
        onClose={() => {
          if (savingMeta) return
          setMetaOpen(false)
          setMetaFile(null)
        }}
        onSave={onSaveMeta}
      />
    </div>
  )
}
