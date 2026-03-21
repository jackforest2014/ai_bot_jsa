import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { isAuthenticated } from '@/router/guards'

export default function RequireAuth() {
  const location = useLocation()

  if (!isAuthenticated()) {
    const from = `${location.pathname}${location.search}`
    return (
      <Navigate to={`/login?from=${encodeURIComponent(from)}`} state={{ from: location }} replace />
    )
  }

  return <Outlet />
}
