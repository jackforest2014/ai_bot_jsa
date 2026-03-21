import type { CitationPayload } from '@/types/sse'

export interface RagCitationProps {
  /** 优先：SSE `citation` */
  citation?: CitationPayload
  /** `<rag>` 内文或标签属性，无 citation 时降级展示 */
  fallbackInner?: string
  attrs?: Record<string, string>
}

function fallbackLabel(attrs: Record<string, string>, inner: string): string {
  return attrs.filename || attrs.file_id || inner.trim().slice(0, 48) || '文档引用'
}

/** RAG 引用：与正文 `<rag>` 及 SSE `citation` 绑定，悬停展示摘录与元数据（任务 3.3，§6.2.2） */
export default function RagCitation({
  citation,
  fallbackInner = '',
  attrs = {},
}: RagCitationProps) {
  const label = citation?.filename ?? citation?.file_id ?? fallbackLabel(attrs, fallbackInner)

  const kind = citation?.kind ?? attrs.kind
  const semantic = citation?.semantic_type ?? attrs.semantic_type
  const excerpt = citation?.excerpt ?? (fallbackInner.trim() || undefined)
  const score = citation?.score
  const fileId = citation?.file_id ?? attrs.file_id

  const hasBody =
    Boolean(citation?.filename) ||
    Boolean(kind) ||
    Boolean(semantic) ||
    Boolean(excerpt) ||
    score != null ||
    Boolean(fileId)

  return (
    <div className="group/rag relative z-0 inline-flex max-w-full align-baseline hover:z-30 focus-within:z-30">
      <button
        type="button"
        className="mx-0.5 inline-flex max-w-full cursor-pointer items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 align-baseline text-xs font-medium text-violet-900 outline-none ring-violet-400/60 hover:bg-violet-100 focus-visible:ring-2"
        aria-haspopup="dialog"
        aria-label={`引用：${String(label)}`}
      >
        <span className="truncate">📎 {String(label)}</span>
      </button>
      <div
        className="pointer-events-none invisible absolute left-0 top-full z-50 min-w-[12rem] max-w-[min(22rem,calc(100vw-2rem))] pt-1 group-hover/rag:pointer-events-auto group-hover/rag:visible group-focus-within/rag:pointer-events-auto group-focus-within/rag:visible"
        role="dialog"
        aria-label="引用详情"
      >
        <div className="pointer-events-auto max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-800 shadow-lg">
          {!hasBody ? (
            <p className="text-slate-500">暂无引用详情（等待 SSE 或标签内文）。</p>
          ) : null}
          {citation?.filename ? (
            <p className="mb-1.5 font-medium text-slate-900">{citation.filename}</p>
          ) : null}
          {fileId ? (
            <p className="mb-1.5 break-all">
              <span className="font-medium text-slate-900">文件 ID：</span>
              {String(fileId)}
            </p>
          ) : null}
          {kind ? (
            <p className="mb-1.5">
              <span className="font-medium text-slate-900">类型：</span>
              {String(kind)}
            </p>
          ) : null}
          {semantic ? (
            <p className="mb-1.5">
              <span className="font-medium text-slate-900">语义类型：</span>
              {semantic}
            </p>
          ) : null}
          {score != null ? (
            <p className="mb-1.5">
              <span className="font-medium text-slate-900">相关度：</span>
              {String(score)}
            </p>
          ) : null}
          {excerpt ? (
            <div>
              <p className="mb-1 font-medium text-slate-900">摘录</p>
              <p className="whitespace-pre-wrap text-slate-700">{excerpt}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
