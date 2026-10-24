import { Link } from 'react-router-dom'
import { Compass, ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/shared/ui/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState icon={<Compass size={36} />} title="Página não encontrada" text="O endereço não existe ou foi movido."
      action={<Link className="btn btn--primary" to="/">Voltar à vitrine</Link>} />
  )
}

export function ForbiddenPage({ role }: { role: 'seller' | 'bidder' }) {
  return (
    <EmptyState icon={<ShieldAlert size={36} />} title="Área restrita"
      text={role === 'seller' ? 'Esta área é exclusiva para leiloeiros.' : 'Esta área é exclusiva para licitantes.'}
      action={<Link className="btn btn--primary" to="/">Voltar à vitrine</Link>} />
  )
}
