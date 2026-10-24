import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ForbiddenPage } from '@/app/pages/StatusPages'
import type { Role } from '../domain/entities'
import { useAuth } from './authStore'

export function RequireAuth({ role }: { role?: Role }) {
  const { user, status } = useAuth()
  const loc = useLocation()
  if (status === 'loading') return <div className="stack" style={{ padding: 32 }}><Skeleton h={28} w="40%" /><Skeleton h={120} /></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (role && user.role !== role) return <ForbiddenPage role={role} />
  return <Outlet />
}
