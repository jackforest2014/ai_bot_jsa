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
      toast.error(
        tooLarge
          ? `以下文件超过 64MB 未加入：${names}`
          : `部分文件无法添加：${names}`,
      )
    },
  })

  return (
    <div
      {...getRootProps()}
      className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed border-slate-700/60 bg-slate-900/40 text-slate-500'
          : isDragActive
            ? 'cursor-pointer border-emerald-400/50 bg-emerald-950/40 text-emerald-100'
            : 'cursor-pointer border-emerald-500/25 bg-slate-900/35 text-slate-400 hover:border-emerald-400/40'
      }`}
    >
      <input {...getInputProps()} />
      <p className="text-sm font-medium text-slate-200">拖拽文件到此处，或</p>
      <button
        type="button"
        disabled={disabled}
        className="mt-2 text-sm font-semibold text-emerald-300 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-200 disabled:opacity-50"
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
      >
        选择文件
      </button>
      <p className="mt-2 text-xs text-slate-500">单文件不超过 64MB；≤5MB 直传，更大走分片上传。</p>
    </div>
  )
}
