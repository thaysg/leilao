import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Share2, Trophy } from 'lucide-react'
import { bidsRepo } from '@/app/di'
import { copyText } from '@/core/clipboard'
import { formatDateTime, formatMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { ErrorState } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LotImage } from '@/shared/ui/LotImage'
import { Skeleton } from '@/shared/ui/Skeleton'
import { toast } from '@/shared/ui/Toast'
import type { Win } from '../domain/entities'
import { BidsTabs } from './BidsTabs'

async function share(w: Win) {
  const url = `${location.origin}/comprovante/${w.code}`
  if (navigator.share) {
    try { await navigator.share({ title: `Comprovante: ${w.title}`, url }); return } catch { /* cancelled: fall through to copy */ }
  }
  toast((await copyText(url)) ? 'Link copiado!' : 'Não foi possível copiar o link.')
}

export function WinsPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['wins'], queryFn: () => bidsRepo.myWins() })
  return (
    <>
      <div className="page-head"><h1>Meus arremates</h1><p>Lotes que você venceu, com comprovante público para compartilhar.</p></div>
      <div className="stack">
        <BidsTabs active="wins" />
        {isLoading ? (
          <div className="grid-lots">{[0, 1, 2].map((i) => <Skeleton key={i} h={320} />)}</div>
        ) : isError ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Trophy size={36} />} title="Você ainda não arrematou nenhum lote" text="Quando vencer um leilão, o comprovante aparece aqui."
            action={<Link className="btn btn--primary" to="/?state=live">Ver lotes ao vivo</Link>} />
        ) : (
          <div className="grid-lots">
            {data.map((w) => (
              <div key={w.code} className="lot-card">
                <LotImage src={w.imageUrl} title={w.title} />
                <div className="lot-card__body">
                  <Link to={`/lotes/${w.lotId}`} className="lot-card__title" style={{ color: 'var(--text)' }}>{w.title}</Link>
                  <div className="lot-card__price"><small>Valor arrematado</small><strong className="money">{formatMoney(w.amountCents)}</strong></div>
                  <small className="muted">{formatDateTime(w.issuedAt)}</small>
                  <div className="row" style={{ marginTop: 'auto' }}>
                    <Link className="btn btn--secondary btn--sm" to={`/comprovante/${w.code}`}>Ver comprovante</Link>
                    <Button size="sm" variant="ghost" onClick={() => void share(w)}><Share2 size={16} /> Compartilhar</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
