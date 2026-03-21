import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
  }`

export default function Sidebar() {
  return (
    <aside className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 p-3">
      <nav className="flex flex-col gap-1">
        <NavLink to="/" end className={linkClass}>
          对话
        </NavLink>
        <NavLink to="/files" className={linkClass}>
          工作空间
        </NavLink>
        <NavLink to="/settings" className={linkClass}>
          设置
        </NavLink>
      </nav>
    </aside>
  )
}
