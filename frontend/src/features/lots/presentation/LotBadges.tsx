import { Badge } from '@/shared/ui/Badge'
import type { LotState } from '../domain/entities'

export function StateBadge({ state, hasWinner }: { state: LotState; hasWinner?: boolean }) {
  switch (state) {
    case 'live': return <Badge tone="success" dot pulse>Ao vivo</Badge>
    case 'scheduled': return <Badge tone="accent">Agendado</Badge>
    case 'cancelled': return <Badge tone="danger">Cancelado</Badge>
    default: return <Badge>{hasWinner === false ? 'Encerrado' : 'Encerrado'}</Badge>
  }
}
