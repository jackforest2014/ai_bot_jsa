/** 工作空间页：与主壳深色一致，用翠绿强调与「对话」区的青色区分 */

export const filePanelClass =
  'rounded-xl border border-emerald-500/20 bg-slate-950/55 p-3 shadow-[inset_0_1px_0_rgba(52,211,153,0.06),0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:p-4'

/** 表单控件本体（不含 margin）；侧栏 label 用 gap 时可单独加 `w-full` */
export const fileControlClass =
  'rounded-md border border-slate-600/80 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500'

export const fileInputClass = `mt-0.5 w-full ${fileControlClass}`

export const fileLabelClass = 'block text-xs font-medium text-slate-400'
