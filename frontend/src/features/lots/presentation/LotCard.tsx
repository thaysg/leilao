import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel } from 'lucide-react'
import { formatMoney } from '@/core/format'
import { Countdown } from '@/shared/ui/Countdown'
import { LotImage } from '@/shared/ui/LotImage'
import type { LotSummary } from '../domain/entities'
import { StateBadge } from './LotBadges'

/** Price that flashes softly whenever it changes. */
function Price({ cents }: { cents: number }) {
  const prev = useRef(cents)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (prev.current !== cents) {
      prev.current = cents
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [cents])
  return <strong className={`money ${flash ? 'flash' : ''}`}>{formatMoney(cents)}</strong>
}

export function LotCard({ lot }: { lot: LotSummary }) {
  const hasBids = lot.bidCount > 0
  const ended = lot.state === 'ended'
  const label = ended ? (lot.finalCents != null ? 'Arrematado por' : 'Lance inicial') : hasBids ? 'Lance atual' : 'Lance inicial'
  const value = ended && lot.finalCents != null ? lot.finalCents : (lot.currentCents ?? lot.startPriceCents)

  return (
    <Link to={`/lotes/${lot.id}`} className="lot-card">
      <div style={{ position: 'relative' }}>
        <LotImage src={lot.imageUrl} title={lot.title} />
        <div className="lot-card__badges"><StateBadge state={lot.state} /></div>
      </div>
      <div className="lot-card__body">
        <span className="lot-card__title">{lot.title}</span>
        <div className="lot-card__price">
          <small>{label}</small>
          <Price cents={value} />
        </div>
        <div className="lot-card__foot">
          <span className="chip">
            {lot.state === 'live' && <>Termina em <Countdown endsAt={lot.endsAt} /></>}
            {lot.state === 'scheduled' && <>Começa em <Countdown endsAt={lot.startsAt} /></>}
            {ended && (lot.finalCents != null ? 'Vendido' : 'Sem lances')}
          </span>
          <span className="row" style={{ gap: 4 }}><Gavel size={14} aria-hidden /> {lot.bidCount}</span>
        </div>
      </div>
    </Link>
  )
}

export function LotCardSkeleton() {
  return (
    <div className="lot-card" aria-hidden>
      <div className="lot-image skeleton" />
      <div className="lot-card__body">
        <div className="skeleton" style={{ height: 18, width: '85%' }} />
        <div className="skeleton" style={{ height: 28, width: '45%' }} />
        <div className="skeleton" style={{ height: 24, width: '60%' }} />
      </div>
    </div>
  )
}
