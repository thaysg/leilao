import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel } from 'lucide-react'
import { bidsRepo } from '@/app/di'
import { formatMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import type { MyStatus } from '@/features/lots/domain/entities'
import { StateBadge } from '@/features/lots/presentation/LotBadges'
import { ErrorState } from '@/shared/ui/Alert'
import { Badge } from '@/shared/ui/Badge'
import type { Tone } from '@/shared/ui/Badge'
import { Countdown } from '@/shared/ui/Countdown'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LotImage } from '@/shared/ui/LotImage'
import { Skeleton } from '@/shared/ui/Skeleton'
import type { MyBidLot } from '../domain/entities'
import { BidsTabs } from './BidsTabs'

const STATUS: Record<MyStatus, { label: string; tone: Tone }> = {
  none: { label: '—', tone: 'neutral' },
  leading: { label: 'Ganhando', tone: 'success' },
  outbid: { label: 'Superado', tone: 'danger' },
  won: { label: 'Vencido', tone: 'success' },
  lost: { label: 'Não venceu', tone: 'neutral' },
}
const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'leading', label: 'Ganhando' },
  { key: 'outbid', label: 'Superado' },
  { key: 'ended', label: 'Encerrados' },
] as const
type Filter = (typeof FILTERS)[number]['key']

const matches = (l: MyBidLot, f: Filter) =>
  f === 'all' || (f === 'ended' ? l.state === 'ended' || l.state === 'cancelled' : l.me.status === f)

export function MyBidsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['myBids'], queryFn: () => bidsRepo.myBids(), refetchInterval: 10_000,
  })
  const rows = (data ?? []).filter((l) => matches(l, filter))

  return (
    <>
      <div className="page-head"><h1>Meus lances</h1><p>Lotes em que você já deu lances, ao vivo e encerrados.</p></div>
      <div className="stack">
        <BidsTabs active="bids" />
        <div className="chips" role="group" aria-label="Filtrar">
          {FILTERS.map((f) => <button key={f.key} aria-pressed={filter === f.key} style={filter === f.key ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        {isLoading ? (
          <div className="list">{[0, 1, 2].map((i) => <Skeleton key={i} h={96} />)}</div>
        ) : isError ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Gavel size={36} />} title="Nenhum lance por aqui" text="Quando você der lances, eles aparecem nesta lista."
            action={<Link className="btn btn--primary" to="/">Explorar a vitrine</Link>} />
        ) : (
          <div className="list">
            {rows.map((l) => (
              <div key={l.id} className="rowcard">
                <LotImage src={l.imageUrl} title={l.title} />
                <div className="rowcard__main">
                  <Link to={`/lotes/${l.id}`}>{l.title}</Link>
                  <small>Seu melhor lance: <span className="money">{formatMoney(l.me.bestBidCents ?? 0)}</span> · Atual: <span className="money">{formatMoney(l.currentCents ?? l.startPriceCents)}</span></small>
                  <div className="row" style={{ gap: 6 }}><StateBadge state={l.state} /><Badge tone={STATUS[l.me.status].tone}>{STATUS[l.me.status].label}</Badge></div>
                </div>
                <div className="rowcard__side">
                  {l.state === 'live' ? <span className="chip">Termina em <Countdown endsAt={l.endsAt} /></span> : <span className="muted">Encerrado</span>}
                  {l.me.status === 'won' && l.receiptCode && <Link className="btn btn--secondary btn--sm" to={`/comprovante/${l.receiptCode}`}>Comprovante</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
