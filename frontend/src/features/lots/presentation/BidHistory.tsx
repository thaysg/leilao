import { aliasLabel, formatDateTimeSec, formatMoney, formatRelative } from '@/core/format'
import { useNow } from '@/core/hooks'
import type { BidEntry } from '../domain/entities'

export function BidHistory({ bids }: { bids: BidEntry[] }) {
  const now = useNow(5000)
  if (bids.length === 0) return <p className="muted">Nenhum lance ainda. Seja o primeiro!</p>
  return (
    <ol className="history" aria-label="Histórico de lances">
      {bids.map((b, i) => (
        <li key={b.seq} className={`${b.isMine ? 'mine' : ''} ${i === 0 ? 'flash' : ''}`}>
          <div>
            <strong>{b.isMine ? 'Você' : aliasLabel(b.alias)}</strong>
            <small title={formatDateTimeSec(b.createdAt)}>#{b.seq} · {formatRelative(b.createdAt, now)}</small>
          </div>
          <strong className="money">{formatMoney(b.amountCents)}</strong>
        </li>
      ))}
    </ol>
  )
}
