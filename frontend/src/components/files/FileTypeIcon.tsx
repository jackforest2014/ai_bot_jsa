import type { ReactNode } from 'react'

/** 按 MIME / 扩展名展示简化类型图标（示意，非品牌商标图） */

const iconWrap = 'h-4 w-4 shrink-0 text-current'

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function PdfIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path fill="#B91C1C" d="M4 4a2 2 0 012-2h8l6 6v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
      <path fill="#FCA5A5" d="M14 2v6h6" />
      <path fill="#FEE2E2" d="M8 11h8v1.5H8V11zm0 3h8v1.5H8V14zm0 3h5v1.5H8V17z" />
      <path fill="#7F1D1D" d="M8 19h4v2H8v-2zm5 0h3v2h-3v-2z" opacity="0.9" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" className="fill-sky-500/25 stroke-sky-500/80" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.8" className="fill-sky-400" />
      <path d="M4 17l4.5-5 3 3.5L14 12l6 6" className="stroke-sky-600 dark:stroke-sky-300" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="14" height="12" rx="2" className="fill-violet-500/20 stroke-violet-500/75" strokeWidth="1.5" />
      <path d="M17 9l4-2v10l-4-2V9z" className="fill-violet-500/80" />
    </svg>
  )
}

function AudioIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18V6l9-2v14"
        className="stroke-pink-500 stroke-[1.75] fill-none"
        strokeLinecap="round"
      />
      <path d="M9 10c-2.5 0-4 1.6-4 3.5S6.5 17 9 17" className="stroke-pink-500 stroke-[1.75] fill-none" />
    </svg>
  )
}

function WordIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" className="fill-blue-600/90" />
      <path fill="white" d="M7 8h2l1.2 4L12 6h2l1.8 6L17 8h2l-2.2 8h-2.2l-1.5-5.2L12 16h-2l-1.5-5.2L7 16H5l2.2-8z" opacity="0.92" />
    </svg>
  )
}

function ExcelIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" className="fill-emerald-700/90" />
      <path stroke="white" strokeWidth="1.2" d="M8 8h8M8 12h8M8 16h5" opacity="0.9" />
      <path fill="white" d="M14 14h4v4h-4v-4z" opacity="0.85" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="3" width="12" height="18" rx="2" className="fill-amber-700/85 stroke-amber-900/40" strokeWidth="1" />
      <path stroke="white" strokeWidth="1.2" d="M9 8h6M9 11h6M9 14h4" opacity="0.85" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 8l-3 4 3 4M16 8l3 4-3 4M13.5 7l-3 10"
        className="stroke-slate-600 dark:stroke-slate-300"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GenericFileIcon() {
  return (
    <svg className={iconWrap} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h8l4 4v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"
        className="fill-slate-400/25 stroke-slate-500/70 dark:stroke-slate-400/60"
        strokeWidth="1.5"
      />
      <path d="M14 3v5h5" className="stroke-slate-500/50 dark:stroke-slate-400/50" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

export function pickFileTypeIcon(mimeType: string, fileName: string): ReactNode {
  const mime = (mimeType || '').toLowerCase().trim()
  const ext = extOf(fileName)

  if (mime === 'application/pdf' || ext === '.pdf') return <PdfIcon />
  if (mime.startsWith('image/')) return <ImageIcon />
  if (mime.startsWith('video/')) return <VideoIcon />
  if (mime.startsWith('audio/')) return <AudioIcon />
  if (
    mime.includes('word') ||
    mime.includes('document') ||
    ['.doc', '.docx', '.odt'].includes(ext)
  ) {
    return <WordIcon />
  }
  if (
    mime.includes('sheet') ||
    mime.includes('excel') ||
    ['.xls', '.xlsx', '.csv', '.ods'].includes(ext)
  ) {
    return <ExcelIcon />
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)
  ) {
    return <ArchiveIcon />
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.xml', '.yaml', '.yml'].includes(ext)
  ) {
    return <CodeIcon />
  }
  return <GenericFileIcon />
}

export default function FileTypeIcon({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  return <span className="inline-flex shrink-0 text-slate-600 dark:text-slate-300">{pickFileTypeIcon(mimeType, fileName)}</span>
}
