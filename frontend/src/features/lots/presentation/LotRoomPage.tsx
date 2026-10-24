import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { formatMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { ErrorState } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { Countdown } from '@/shared/ui/Countdown'
import { LotImage } from '@/shared/ui/LotImage'
import { Skeleton } from '@/shared/ui/Skeleton'
import { BidHistory } from './BidHistory'
import { BidPanel } from './BidPanel'
import { useLot } from './hooks'
import { useLotRealtime } from './useLotRealtime'

export function LotRoomPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const connected = useLotRealtime(id, true)
  // WebSocket keeps the room fresh; if it drops, fall back to polling every 5 s.
  const { data: lot, isLoading, isError, error, refetch } = useLot(id, connected ? false : 5000)
  const onEnd = useCallback(() => { void qc.invalidateQueries({ queryKey: ['lot', id] }) }, [qc, id])

  if (isLoading) {
    return <div className="room"><div className="stack"><Skeleton h={360} /><Skeleton h={28} w="60%" /></div><Skeleton h={420} /></div>
  }
  if (isError || !lot) {
    const notFound = error instanceof ApiError && error.status === 404
    return <ErrorState message={notFound ? 'Este lote não existe ou foi cancelado.' : error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={notFound ? undefined : () => void refetch()} />
  }

  const price = lot.currentCents ?? lot.startPriceCents
  return (
    <>
      <p style={{ marginBottom: 14 }}><Link to="/" className="row" style={{ gap: 4, display: 'inline-flex' }}><ChevronLeft size={16} /> Vitrine</Link></p>
      <div className="room">
        <div className="room__head stack">
          <LotImage src={lot.imageUrl} title={lot.title} round priority />
          <div className="room__title">
            <h1>{lot.title}</h1>
            <span className="muted">Leiloeiro: {lot.sellerName}</span>
          </div>
        </div>
        {/* On mobile the bidding panel sits right under the title; on desktop it is a sticky right column. */}
        <aside className="room__side"><BidPanel lot={lot} connected={connected} /></aside>
        <div className="room__more stack" style={{ gap: 24 }}>
          {Object.keys(lot.attributes).length > 0 && (
            <Card>
              <h3 style={{ marginBottom: 12 }}>Sobre a obra</h3>
              <dl className="attrs">{Object.entries(lot.attributes).map(([k, v]) => (<div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
              {lot.description && <p className="muted" style={{ marginTop: 14 }}>{lot.description.replace(/<[^>]+>/g, '')}</p>}
            </Card>
          )}
          <Card>
            <div className="spread" style={{ marginBottom: 8 }}><h3>Histórico de lances</h3><span className="muted">{lot.bidCount} lance(s)</span></div>
            <BidHistory bids={lot.bids} />
          </Card>
        </div>
      </div>

      {lot.state === 'live' && (
        <div className="mobilebar">
          <div><small>{lot.bidCount === 0 ? 'Lance inicial' : 'Lance atual'}</small><strong className="money">{formatMoney(price)}</strong> · <Countdown endsAt={lot.endsAt} onEnd={onEnd} /></div>
          <Button size="sm" onClick={() => document.getElementById('bid-panel')?.scrollIntoView({ behavior: 'smooth' })}>Dar lance</Button>
        </div>
      )}
      {lot.state === 'scheduled' && <span className="sr-only"><Countdown endsAt={lot.startsAt} onEnd={onEnd} /></span>}
    </>
  )
}
