import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Controller, useForm } from 'react-hook-form'

import UploadFolderPicker from '@/components/files/UploadFolderPicker'
import { SEMANTIC_TYPE_OPTIONS } from '@/lib/semantic-types'
import { fileControlClass, fileLabelClass } from '@/lib/file-workspace-theme'
import type { FileInfo } from '@/types/file'

const modalCardClass =
  'w-full max-w-md rounded-xl border border-emerald-500/35 bg-white p-4 shadow-xl dark:border-emerald-500/25 dark:bg-slate-950/95 dark:shadow-[0_24px_64px_rgba(0,0,0,0.55)]'

const uploadModalCardClass =
  'w-full max-w-lg rounded-xl border border-emerald-500/35 bg-white p-4 shadow-xl dark:border-emerald-500/25 dark:bg-slate-950/95 dark:shadow-[0_24px_64px_rgba(0,0,0,0.55)]'

const btnCancelClass =
  'rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:border-slate-500/40 dark:text-slate-400 dark:hover:border-slate-400/60 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'

const btnPrimaryClass =
  'rounded-lg border-0 bg-gradient-to-r from-emerald-700 to-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:from-emerald-600 hover:to-emerald-500 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600 disabled:shadow-none disabled:opacity-50'

export type SemanticTypeModalProps =
  | {
      variant: 'edit'
      open: boolean
      file: FileInfo | null
      saving?: boolean
      onClose: () => void
      onSave: (semanticType: string | null, tags: string[]) => Promise<void>
    }
  | {
      variant: 'upload'
      open: boolean
      fileNames: string[]
      /** 用于拼目录树（已有文件的 folder_path） */
      explorerFiles: FileInfo[]
      defaultFolderPath?: string
      defaultTags?: string
      saving?: boolean
      onClose: () => void
      onConfirm: (meta: { semantic_type: string; folder_path: string; tags: string[] }) => void
    }

type EditFormValues = {
  semantic: string
  tags: string
}

function EditSemanticBody({
  file,
  saving,
  onClose,
  onSave,
}: {
  file: FileInfo
  saving?: boolean
  onClose: () => void
  onSave: (semanticType: string | null, tags: string[]) => Promise<void>
}) {
  const { register, handleSubmit, reset } = useForm<EditFormValues>({
    defaultValues: {
      semantic: file.semantic_type ?? '',
      tags: file.tags.join(', '),
    },
  })

  const tagsKey = file.tags.join(',')

  useEffect(() => {
    reset({
      semantic: file.semantic_type ?? '',
      tags: file.tags.join(', '),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagsKey 覆盖 tags 内容
  }, [file.id, file.semantic_type, tagsKey, reset])

  const submit = handleSubmit(async (values) => {
    const trimmed = values.semantic.trim()
    const tags = values.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    await onSave(trimmed === '' ? null : trimmed, tags)
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="semantic-modal-title"
      className={modalCardClass}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h2 id="semantic-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        编辑类型与标签
      </h2>
      <p className="mt-1 truncate text-sm text-slate-400" title={file.original_name}>
        {file.original_name}
      </p>

      <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        <label className={fileLabelClass}>
          语义类型（可留空）
          <input
            type="text"
            className={`mt-1 w-full ${fileControlClass}`}
            disabled={saving}
            {...register('semantic')}
          />
        </label>

        <label className={fileLabelClass}>
          标签（逗号分隔）
          <textarea
            className={`mt-1 w-full ${fileControlClass}`}
            rows={3}
            disabled={saving}
            {...register('tags')}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className={btnCancelClass}
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button type="submit" className={btnPrimaryClass} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  )
}

type UploadFormValues = {
  semantic_type: string
  folder_path: string
  tags: string
}

function UploadSemanticBody({
  fileNames,
  explorerFiles,
  defaultFolderPath,
  defaultTags,
  saving,
  onClose,
  onConfirm,
}: {
  fileNames: string[]
  explorerFiles: FileInfo[]
  defaultFolderPath?: string
  defaultTags?: string
  saving?: boolean
  onClose: () => void
  onConfirm: (meta: { semantic_type: string; folder_path: string; tags: string[] }) => void
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UploadFormValues>({
    defaultValues: {
      semantic_type: '',
      folder_path: defaultFolderPath ?? '',
      tags: defaultTags ?? '',
    },
  })

  const batchKey = fileNames.join('\0')

  useEffect(() => {
    if (!fileNames.length) return
    reset({
      semantic_type: '',
      folder_path: defaultFolderPath ?? '',
      tags: defaultTags ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- batchKey 覆盖 fileNames
  }, [batchKey, defaultFolderPath, defaultTags, reset])

  const submit = handleSubmit((values) => {
    const tags = values.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    onConfirm({
      semantic_type: values.semantic_type.trim(),
      folder_path: values.folder_path.trim(),
      tags,
    })
  })

  const preview =
    fileNames.length <= 3
      ? fileNames.join('、')
      : `${fileNames.slice(0, 3).join('、')} 等 ${fileNames.length} 个文件`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="semantic-modal-title"
      className={uploadModalCardClass}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <h2 id="semantic-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        填写上传元数据
      </h2>
      <p className="mt-1 text-sm text-slate-400" title={fileNames.join('\n')}>
        {preview}
      </p>

      <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        <label className={fileLabelClass}>
          语义类型（必填）
          <select
            className={`mt-1 w-full ${fileControlClass}`}
            disabled={saving}
            {...register('semantic_type', { required: '请选择语义类型' })}
          >
            <option value="">请选择</option>
            {SEMANTIC_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {errors.semantic_type ? (
          <p className="text-xs text-red-300/90">{errors.semantic_type.message}</p>
        ) : null}

        <label className={fileLabelClass}>
          标签（可选，逗号分隔）
          <textarea
            className={`mt-1 w-full ${fileControlClass}`}
            rows={2}
            placeholder="例如 合同, 财务"
            disabled={saving}
            {...register('tags')}
          />
        </label>

        <Controller
          name="folder_path"
          control={control}
          render={({ field }) => (
            <UploadFolderPicker
              resetKey={batchKey}
              files={explorerFiles}
              value={field.value}
              onChange={field.onChange}
              disabled={saving}
            />
          )}
        />
        <p className="text-[11px] text-slate-500">
          树中选「根目录」且路径留空时，与此前一致：确认后沿用工具栏当前的默认上传目录。
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className={btnCancelClass}
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button type="submit" className={btnPrimaryClass} disabled={saving}>
            开始上传
          </button>
        </div>
      </form>
    </div>
  )
}

export default function SemanticTypeModal(props: SemanticTypeModalProps) {
  if (!props.open) return null
  if (props.variant === 'edit' && !props.file) return null
  if (props.variant === 'upload' && !props.fileNames.length) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-slate-950/85"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      {props.variant === 'edit' && props.file ? (
        <EditSemanticBody
          file={props.file}
          saving={props.saving}
          onClose={props.onClose}
          onSave={props.onSave}
        />
      ) : null}
      {props.variant === 'upload' && props.fileNames.length > 0 ? (
        <UploadSemanticBody
          fileNames={props.fileNames}
          explorerFiles={props.explorerFiles}
          defaultFolderPath={props.defaultFolderPath}
          defaultTags={props.defaultTags}
          saving={props.saving}
          onClose={props.onClose}
          onConfirm={props.onConfirm}
        />
      ) : null}
    </div>,
    document.body,
  )
}
