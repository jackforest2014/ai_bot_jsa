/** 与上传弹窗、侧栏文件夹树共用的折叠控件与子级缩进（仅子列表相对父行右移） */

/** 包在子级 `<ul>` 外：相对父文件夹行整体右移，不增加父行本身的左缩进 */
export const TREE_CHILD_NEST_CLASS =
  'mt-0.5 ml-4 border-l border-emerald-500/25 pl-2 sm:ml-5 sm:pl-2.5'

export function FolderChevronToggle({
  expanded,
  onToggle,
  disabled,
}: {
  expanded: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={expanded}
      title={expanded ? '折叠子文件夹' : '展开子文件夹'}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-800/70 hover:text-emerald-200/90 disabled:opacity-40"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onToggle()
      }}
    >
      <span
        className={`inline-block text-[10px] leading-none transition-transform ${expanded ? 'rotate-90' : ''}`}
        aria-hidden
      >
        ▸
      </span>
    </button>
  )
}
