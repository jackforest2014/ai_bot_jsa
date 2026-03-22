import { Navigate } from 'react-router-dom'

/** 工作空间已并入对话页底部面板；保留路由以兼容书签与外链 */
export default function FileWorkspace() {
  return <Navigate to="/" replace />
}
