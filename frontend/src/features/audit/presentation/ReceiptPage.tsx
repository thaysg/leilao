import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, Copy, Printer, ReceiptText } from 'lucide-react'
import { auditRepo } from '@/app/di'
import { copyText } from '@/core/clipboard'
import { aliasLabel, formatDateTime, formatMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { ErrorState } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LotImage } from '@/shared/ui/LotImage'
import { Skeleton } from '@/shared/ui/Skeleton'
import { toast } from '@/shared/ui/Toast'

export function ReceiptPage() {
  const code = useParams().code ?? ''
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['receipt', code], queryFn: () => auditRepo.receipt(code), retry: false })

  if (isLoading) return <Skeleton h={520} />
  if (isError || !data) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState icon={<ReceiptText size={36} />} title="Comprovante não encontrado" text="Confira o link recebido." action={<Link className="btn btn--primary" to="/">Ir para a vitrine</Link>} />
    }
    return <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
  }

  const link = `${location.origin}/comprovante/${data.code}`
  return (
    <Card className="receipt card--raised">
      <LotImage src={data.imageUrl} title={data.title} />
      <div className="receipt__body">
        <div className="row"><BadgeCheck size={20} color="var(--success)" aria-hidden /><span className="muted">Comprovante de arremate</span></div>
        <h1 style={{ fontSize: '1.5rem' }}>{data.title}</h1>
        <div><span className="muted">Valor arrematado</span><div className="receipt__amount money">{formatMoney(data.amountCents)}</div></div>
        <div className="receipt__rows">
          <div className="kv"><small>Arrematante</small><strong>{aliasLabel(data.winnerAlias)}</strong></div>
          <div className="kv"><small>Leiloeiro</small><strong>{data.sellerName}</strong></div>
          <div className="kv"><small>Emitido em</small><strong>{formatDateTime(data.issuedAt)}</strong></div>
          <div className="kv"><small>Lances no lote</small><strong>{data.bidCount}</strong></div>
        </div>
        {Object.keys(data.attributes).length > 0 && (
          <dl className="attrs" style={{ fontSize: '0.85rem' }}>{Object.entries(data.attributes).slice(0, 4).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        )}
        <div className="kv"><small>Código de verificação (último elo do histórico)</small><code className="hash" style={{ wordBreak: 'break-all', padding: 8 }}>{data.headHash}</code></div>
        <Link to={`/auditoria/${data.lotId}`}>Verificar a integridade do histórico deste lote →</Link>
        <div className="row no-print">
          <Button variant="secondary" onClick={async () => toast((await copyText(link)) ? 'Link copiado!' : 'Não foi possível copiar')}><Copy size={16} /> Copiar link</Button>
          <Button variant="ghost" onClick={() => window.print()}><Printer size={16} /> Imprimir</Button>
        </div>
      </div>
    </Card>
  )
}
