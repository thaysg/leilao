import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, Clock, Crown, Trophy, XCircle } from 'lucide-react'
import { lotRepo } from '@/app/di'
import { centsToInput, formatDateTime, formatMoney, parseMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { useAuth } from '@/features/auth/presentation/authStore'
import { Alert } from '@/shared/ui/Alert'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Countdown } from '@/shared/ui/Countdown'
import { Input } from '@/shared/ui/Field'
import { toast } from '@/shared/ui/Toast'
import { bidErrorView, quickBidOptions } from '../domain/bidRules'
import type { BidErrorView } from '../domain/bidRules'
import type { LotDetail } from '../domain/entities'
import { StateBadge } from './LotBadges'

function StatusBanner({ lot }: { lot: LotDetail }) {
  const { me } = lot
  const pos = me.position && me.position > 1 ? `Você está em ${me.position}º lugar. ` : ''
  switch (me.status) {
    case 'leading': return <div className="statusbox statusbox--success" role="status"><Crown size={22} /><div>Você está ganhando<small>Seu lance de {formatMoney(me.bestBidCents ?? 0)} é o maior.</small></div></div>
    case 'outbid': return <div className="statusbox statusbox--danger" role="status"><XCircle size={22} /><div>Você foi superado<small>{pos}O lance atual é {formatMoney(lot.currentCents ?? 0)}.</small></div></div>
    case 'won': return (
      <div className="statusbox statusbox--success" role="status"><Trophy size={22} />
        <div>Você venceu este lote!<small>{lot.receiptCode ? <Link to={`/comprovante/${lot.receiptCode}`}>Ver comprovante de arremate</Link> : 'Comprovante sendo gerado…'}</small></div></div>)
    case 'lost': return <div className="statusbox statusbox--neutral" role="status"><XCircle size={22} /><div>Você não venceu este lote<small>Vencedor: lance final de {formatMoney(lot.finalCents ?? 0)}.</small></div></div>
    default: return null
  }
}

export function BidPanel({ lot, connected }: { lot: LotDetail; connected: boolean }) {
  const { user } = useAuth()
  const loc = useLocation()
  const qc = useQueryClient()
  const [value, setValue] = useState('')
  const [err, setErr] = useState<BidErrorView | null>(null)
  const live = lot.state === 'live'
  const price = lot.currentCents ?? lot.startPriceCents

  const mutation = useMutation({
    mutationFn: (cents: number) => lotRepo.placeBid(lot.id, cents),
    onSuccess: (fresh) => {
      qc.setQueryData(['lot', lot.id], fresh) // no optimistic update: only what the server confirmed
      void qc.invalidateQueries({ queryKey: ['wallet'] })
      void qc.invalidateQueries({ queryKey: ['myBids'] })
      setValue('')
      setErr(null)
      toast('Lance registrado!')
    },
    onError: (e) => {
      const api = e instanceof ApiError ? e : new ApiError('unknown', 'Não foi possível enviar o lance.', 0)
      setErr(bidErrorView(api, formatMoney))
      void qc.invalidateQueries({ queryKey: ['lot', lot.id] }) // the lot probably moved: show the fresh state
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseMoney(value)
    if (!cents) return setErr({ message: 'Informe o valor do lance.' })
    setErr(null)
    mutation.mutate(cents)
  }

  const canBid = user?.role === 'bidder' && live
  return (
    <div className="card card--raised bidbox" id="bid-panel">
      <div className="spread">
        <StateBadge state={lot.state} />
        <span className={`conn ${connected ? '' : 'off'}`} title={connected ? 'Atualização em tempo real ativa' : 'Reconectando; atualizando a cada 5 s'}>
          <span className="dot" aria-hidden /> {connected ? 'Tempo real' : 'Reconectando…'}
        </span>
      </div>

      <div className="bidbox__price">
        <small>{lot.bidCount === 0 ? 'Lance inicial' : lot.state === 'ended' && lot.finalCents != null ? 'Lance final' : 'Lance atual'}</small>
        <strong className="money">{formatMoney(lot.state === 'ended' && lot.finalCents != null ? lot.finalCents : price)}</strong>
      </div>

      <div className="bidbox__meta">
        <div>
          <small>{lot.state === 'scheduled' ? 'Começa em' : lot.state === 'live' ? 'Termina em' : 'Encerrado'}</small>
          <strong>
            {lot.state === 'scheduled' && <Countdown endsAt={lot.startsAt} />}
            {lot.state === 'live' && <Countdown endsAt={lot.endsAt} />}
            {lot.state === 'ended' && formatDateTime(lot.endsAt)}
          </strong>
        </div>
        <div><small>Lances</small><strong>{lot.bidCount}</strong></div>
      </div>

      {lot.extended && live && (
        <div className="row" title="Um lance nos últimos 2 minutos estende o fim do lote em +2 minutos.">
          <Badge tone="warning"><Clock size={12} /> Prorrogado</Badge>
          <span className="muted" style={{ fontSize: '0.82rem' }}>Lances nos últimos 2 min estendem o fim.</span>
        </div>
      )}

      {user?.role === 'bidder' && <StatusBanner lot={lot} />}

      {lot.state === 'ended' && !lot.hasWinner && <Alert tone="info">Este lote foi encerrado sem lances.</Alert>}
      {lot.state === 'ended' && lot.hasWinner && user?.role !== 'bidder' && <Alert tone="info">Arrematado por {lot.winnerAlias ? `Licitante #${lot.winnerAlias}` : 'um licitante'} por {formatMoney(lot.finalCents ?? 0)}.</Alert>}
      {lot.state === 'cancelled' && <Alert tone="danger">Este lote foi cancelado pelo leiloeiro.</Alert>}
      {lot.state === 'scheduled' && <Alert tone="info">Lances serão aceitos a partir de {formatDateTime(lot.startsAt)}.</Alert>}

      {live && !user && (
        <Link className="btn btn--primary btn--block" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>Entrar para dar lances</Link>
      )}
      {live && user?.role === 'seller' && <Alert tone="info">Leiloeiros acompanham os lotes, mas não dão lances.</Alert>}

      {canBid && (
        <form className="stack" onSubmit={submit} noValidate style={{ gap: 12 }}>
          <Input label={`Seu lance (mínimo ${formatMoney(lot.minNextBidCents)})`} prefix="R$" inputMode="decimal" placeholder={centsToInput(lot.minNextBidCents)}
            value={value} onChange={(e) => { setValue(e.target.value); setErr(null) }} error={err?.message ?? null} disabled={mutation.isPending} />
          <div className="chips" aria-label="Sugestões de lance">
            {quickBidOptions(lot).map((c) => <button type="button" key={c} onClick={() => { setValue(centsToInput(c)); setErr(null) }}>{formatMoney(c)}</button>)}
          </div>
          {err?.action === 'deposit' && <Link className="btn btn--secondary btn--sm" to="/carteira">Depositar saldo</Link>}
          {err?.action === 'login' && <Link className="btn btn--secondary btn--sm" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>Entrar</Link>}
          <Button type="submit" block loading={mutation.isPending}><CheckCircle2 size={18} /> Dar lance</Button>
        </form>
      )}

      <Link to={`/auditoria/${lot.id}`} className="muted" style={{ fontSize: '0.85rem', textAlign: 'center' }}>Verificar integridade do histórico</Link>
    </div>
  )
}
