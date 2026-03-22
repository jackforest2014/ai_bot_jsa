import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'

import { MAX_FILE_BYTES } from '@/types/file'

export interface UploadDropzoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export default function UploadDropzone({ onFiles, disabled }: UploadDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) onFiles(accepted)
    },
    [onFiles],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    disabled,
    multiple: true,
    maxSize: MAX_FILE_BYTES,
    onDropRejected: (rejections) => {
      const names = rejections.map((r) => r.file.name).join('、')
      const tooLarge = rejections.some((r) =>
        r.errors.some((e) => e.code === 'file-too-large'),
      )
      const maxMb = MAX_FILE_BYTES / (1024 * 1024)
      toast.error(
        tooLarge
          ? `以下文件超过 ${maxMb}MB 未加入：${names}`
          : `部分文件无法添加：${names}`,
      )
    },
  })

  return (
    <div
      {...getRootProps()}
      className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-500'
          : isDragActive
            ? 'cursor-pointer border-emerald-500/60 bg-emerald-50 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-950/40 dark:text-emerald-100'
            : 'cursor-pointer border-emerald-400/50 bg-emerald-50/40 text-slate-600 hover:border-emerald-500/60 dark:border-emerald-500/25 dark:bg-slate-900/35 dark:text-slate-400 dark:hover:border-emerald-400/40'
      }`}
    >
      <input {...getInputProps()} />
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">拖拽文件到此处，或</p>
      <button
        type="button"
        disabled={disabled}
        className="mt-2 text-sm font-semibold text-emerald-700 underline decoration-emerald-500/60 underline-offset-2 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-300 dark:decoration-emerald-500/50 dark:hover:text-emerald-200"
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
      >
        选择文件
      </button>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-500">
        单文件不超过 {MAX_FILE_BYTES / (1024 * 1024)}MB；≤5MB 直传，更大走分片上传。
      </p>
    </div>
  )
}
