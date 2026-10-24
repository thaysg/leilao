import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { sellerRepo } from '@/app/di'
import { aliasLabel, formatDateTime, formatMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { StateBadge } from '@/features/lots/presentation/LotBadges'
import { Alert } from '@/shared/ui/Alert'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LotImage } from '@/shared/ui/LotImage'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/Toast'
import type { SellerLot } from '../domain/entities'

export function MyLotsTab({ lots, onNew }: { lots: SellerLot[]; onNew: () => void }) {
  const qc = useQueryClient()
  const [target, setTarget] = useState<SellerLot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cancel = useMutation({
    mutationFn: ({ id, refund }: { id: number; refund: boolean }) => sellerRepo.cancel(id, refund),
    onSuccess: () => {
      toast('Lote cancelado.')
      setTarget(null)
      void qc.invalidateQueries({ queryKey: ['sellerLots'] })
      void qc.invalidateQueries({ queryKey: ['lots'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Não foi possível cancelar.'),
  })

  if (lots.length === 0) {
    return <EmptyState title="Você ainda não criou lotes" text="Busque um item e publique seu primeiro lote." action={<Button onClick={onNew}><Plus size={16} /> Novo lote</Button>} />
  }
  return (
    <>
      <div className="list">
        {lots.map((l) => (
          <div key={l.id} className="rowcard">
            <LotImage src={l.imageUrl} title={l.title} />
            <div className="rowcard__main">
              <Link to={`/lotes/${l.id}`}>{l.title}</Link>
              <small>Termina {formatDateTime(l.endsAt)} · {l.bidCount} lance(s) · Atual: <span className="money">{formatMoney(l.currentCents ?? l.startPriceCents)}</span></small>
              <div className="row" style={{ gap: 6 }}>
                <StateBadge state={l.cancelled ? 'cancelled' : l.state} />
                {l.cancelledWithRefund && <Badge tone="warning">Lances estornados</Badge>}
              </div>
            </div>
            <div className="rowcard__side">
              <div className="row" style={{ gap: 6 }}>
                <Link className="btn btn--secondary btn--sm" to={`/auditoria/${l.id}`}>Auditoria</Link>
                <Button size="sm" variant="danger" disabled={!l.canCancel} onClick={() => { setError(null); setTarget(l) }}>Cancelar</Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {target && (
        <Modal title="Cancelar lote" onClose={() => setTarget(null)}>
          <p>Você vai cancelar <strong>{target.title}</strong>. Ele deixa de aparecer na vitrine.</p>
          {target.bidCount > 0 && <Alert tone="warning">Este lote já tem {target.bidCount} lance(s). Cancelar agora estorna os valores reservados ao licitante líder automaticamente.</Alert>}
          {error && <Alert tone="danger" live>{error}</Alert>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setTarget(null)}>Voltar</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate({ id: target.id, refund: target.bidCount > 0 })}>
              {target.bidCount > 0 ? 'Cancelar e estornar lances' : 'Cancelar lote'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

export { aliasLabel }
