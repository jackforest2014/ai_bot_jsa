import type { UploadQueueItem } from '@/hooks/useFileUpload'

export interface UploadProgressProps {
  items: UploadQueueItem[]
  onRetry: (clientId: string) => void
  onDismiss: (clientId: string) => void
  onClearFinished?: () => void
}

function borderClass(item: UploadQueueItem): string {
  if (item.status === 'error') return 'border border-red-500/40 bg-red-950/35'
  if (item.status === 'success') return 'border border-emerald-500/25 bg-emerald-950/20'
  return 'border border-dashed border-slate-600/70 bg-slate-900/50'
}

export default function UploadProgress({
  items,
  onRetry,
  onDismiss,
  onClearFinished,
}: UploadProgressProps) {
  if (items.length === 0) return null

  const hasTerminal = items.some((x) => x.status === 'success' || x.status === 'error')

  return (
    <section className="space-y-2" aria-label="上传进度">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-emerald-100/90">上传队列</h3>
        {hasTerminal && onClearFinished ? (
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline decoration-slate-600 underline-offset-2 hover:text-emerald-300/90"
            onClick={onClearFinished}
          >
            清除已完成
          </button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.clientId} className={`rounded-lg px-3 py-2 ${borderClass(item)}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">{item.file.name}</p>
                <p className="text-xs text-slate-500">
                  {item.status === 'uploading'
                    ? `上传中 ${item.progress}%`
                    : item.status === 'success'
                      ? '已完成'
                      : item.status === 'error'
                        ? (item.errorMessage ?? '失败')
                        : '等待中'}
                </p>
                {item.status === 'uploading' || item.status === 'pending' ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-150"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {item.status === 'error' ? (
                  <button
                    type="button"
                    className="rounded border border-slate-600/80 bg-slate-900/70 px-2 py-1 text-xs font-medium text-slate-200 hover:border-emerald-500/35"
                    onClick={() => onRetry(item.clientId)}
                  >
                    重试
                  </button>
                ) : null}
                {item.status === 'success' || item.status === 'error' ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
                    onClick={() => onDismiss(item.clientId)}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
