import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { filesAPI } from '@/api/files'
import FileFolderTree from '@/components/files/FileFolderTree'
import FileList from '@/components/files/FileList'
import FileToolbar, {
  type FileSortKey,
  type FolderFilterMode,
} from '@/components/files/FileToolbar'
import FolderBreadcrumb from '@/components/files/FolderBreadcrumb'
import SemanticTypeModal from '@/components/files/SemanticTypeModal'
import UploadDropzone from '@/components/files/UploadDropzone'
import UploadProgress from '@/components/files/UploadProgress'
import { useFiles, type FilesListCacheQuery } from '@/hooks/useFiles'
import { useFileUpload } from '@/hooks/useFileUpload'
import { clearFilesListCache } from '@/lib/files-list-cache'
import { filePanelClass } from '@/lib/file-workspace-theme'
import type { FileInfo } from '@/types/file'

function listFolderFromUi(mode: FolderFilterMode, prefix: string): string | undefined {
  if (mode === 'all') return undefined
  if (mode === 'root') return ''
  return prefix.trim()
}

function compareFiles(a: FileInfo, b: FileInfo, sortKey: FileSortKey): number {
  switch (sortKey) {
    case 'time_desc':
      return b.created_at - a.created_at
    case 'time_asc':
      return a.created_at - b.created_at
    case 'name_asc':
      return a.original_name.localeCompare(b.original_name, 'zh-CN')
    case 'name_desc':
      return b.original_name.localeCompare(a.original_name, 'zh-CN')
    case 'size_desc':
      return b.size - a.size
    case 'size_asc':
      return a.size - b.size
    default:
      return 0
  }
}

export default function FileWorkspace() {
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

  const { files, loading, error, fromCacheOnly, refresh, removeLocal, upsertLocal } =
    useFiles(filesQuery)

  const { files: explorerFiles, refresh: refreshExplorerTree } = useFiles(fullListQuery)

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

  const breadcrumbFolder = filesQuery.folder

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
    [refreshAll, removeLocal],
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

  return (
    <div className="mx-auto max-w-full space-y-4 sm:space-y-6">
      <div>
        <h2 className="bg-gradient-to-r from-emerald-200 via-slate-100 to-slate-300 bg-clip-text text-lg font-semibold text-transparent sm:text-xl">
          工作空间
        </h2>
        <p className="mt-1 text-sm text-slate-400">上传、筛选与管理文件；大文件自动分片上传。</p>
      </div>

      <FolderBreadcrumb folder={breadcrumbFolder} onNavigate={navigateFolder} />

      {fromCacheOnly ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          当前无法连接服务器，正在展示<strong className="mx-0.5 text-amber-50">本机缓存</strong>
          的文件列表（与当前目录 / 类型筛选一致）。网络恢复后请点击「刷新列表」；上传、重命名或修改标签后缓存会自动失效。
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <aside className="shrink-0 lg:w-56 xl:w-64">
          <FileFolderTree
            files={explorerFiles}
            folderMode={folderMode}
            folderPrefix={folderPrefix}
            onNavigate={navigateFolder}
          />
        </aside>

        <div className="min-w-0 flex-1 space-y-4 sm:space-y-6">
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

          <section className={`space-y-3 ${filePanelClass}`}>
            <h3 className="text-sm font-semibold text-emerald-100/95">上传</h3>
            <p className="text-xs text-slate-500">
              当前上传目录：
              <span className="font-mono text-emerald-200/80">
                {uploadFolderPath ? uploadFolderPath : '（根目录）'}
              </span>
              ；在工具栏选择「路径前缀」并填写后，可作为默认目录；也可在弹窗中单独指定。
            </p>
            <UploadDropzone onFiles={onPickFiles} disabled={false} />
            <UploadProgress
              items={items}
              onRetry={retry}
              onDismiss={dismiss}
              onClearFinished={clearFinished}
            />
          </section>

          <FileList
            files={displayFiles}
            emptyMessage={listEmptyMessage}
            loading={loading}
            error={error}
            onRename={onRename}
            onDelete={onDelete}
            onDownload={onDownload}
            onEditMeta={onEditMeta}
            onRetryProcess={onRetryProcess}
            busyId={busyId}
          />
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
