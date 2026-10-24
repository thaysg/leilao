import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

const icons = { danger: XCircle, warning: AlertTriangle, success: CheckCircle2, info: Info }

export function Alert({ tone = 'info', children, live }: { tone?: keyof typeof icons; children: ReactNode; live?: boolean }) {
  const Icon = icons[tone]
  return (
    <div className={`alert alert--${tone}`} role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined}>
      <Icon size={18} aria-hidden />
      <div>{children}</div>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      <XCircle size={32} aria-hidden />
      <h3>Não foi possível carregar</h3>
      <p>{message}</p>
      {onRetry && <button className="btn btn--secondary" onClick={onRetry}>Tentar novamente</button>}
    </div>
  )
}
