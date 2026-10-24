import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Check, ChevronLeft, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { auditRepo } from '@/app/di'
import { copyText } from '@/core/clipboard'
import { aliasLabel, formatDateTime, formatDateTimeSec, formatMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { ErrorState } from '@/shared/ui/Alert'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { LotImage } from '@/shared/ui/LotImage'
import { Skeleton } from '@/shared/ui/Skeleton'
import { toast } from '@/shared/ui/Toast'

function Hash({ value }: { value: string }) {
  return (
    <button type="button" className="hash" title="Copiar hash completo" onClick={async () => toast((await copyText(value)) ? 'Hash copiado' : 'Não foi possível copiar')}>
      {value.slice(0, 10)}…
    </button>
  )
}

export function AuditPage() {
  const lotId = Number(useParams().lotId)
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['audit', lotId], queryFn: () => auditRepo.audit(lotId), enabled: Number.isFinite(lotId) })

  if (isLoading) return <div className="stack"><Skeleton h={110} /><Skeleton h={300} /></div>
  if (isError || !data) {
    const nf = error instanceof ApiError && error.status === 404
    return <ErrorState message={nf ? 'Lote não encontrado.' : error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={nf ? undefined : () => void refetch()} />
  }

  const badSeqs = new Set(data.issues.map((i) => i.seq).filter((s): s is number => s !== null))
  return (
    <div className="stack" style={{ gap: 22 }}>
      <p><Link to={`/lotes/${data.lot.id}`} className="row" style={{ gap: 4, display: 'inline-flex' }}><ChevronLeft size={16} /> Voltar ao lote</Link></p>

      <div className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
        <div style={{ width: 88, flex: 'none' }}><LotImage src={data.lot.imageUrl} title={data.lot.title} round /></div>
        <div><span className="muted">Auditoria pública do histórico</span><h1 style={{ fontSize: '1.4rem' }}>{data.lot.title}</h1></div>
      </div>

      <div className={`verdict ${data.intact ? 'verdict--ok' : 'verdict--bad'}`} role="status">
        {data.intact ? <ShieldCheck size={44} aria-hidden /> : <ShieldAlert size={44} aria-hidden />}
        <div>
          <h2>{data.intact ? 'Histórico íntegro' : 'Histórico adulterado'}</h2>
          <p>{data.intact ? 'Nenhuma alteração, remoção ou inserção foi detectada.' : 'Foram detectadas inconsistências neste histórico de lances.'} Verificado em {formatDateTimeSec(data.checkedAt)}.</p>
        </div>
      </div>

      {!data.intact && (
        <Card>
          <h3 style={{ marginBottom: 8 }}>Problemas encontrados</h3>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.issues.map((i, k) => <li key={k}><TriangleAlert size={14} style={{ verticalAlign: '-2px' }} aria-hidden /> {i.message}</li>)}
          </ul>
        </Card>
      )}

      <Card>
        <div className="spread" style={{ marginBottom: 6 }}><h3>Lances em ordem cronológica</h3><span className="muted">{data.bidCount} lance(s)</span></div>
        {data.bids.length === 0 ? (
          <EmptyState title="Sem lances" text="Este lote ainda não recebeu lances." />
        ) : (
          <ol className="timeline" aria-label="Lances">
            {data.bids.map((b) => {
              const bad = !b.ok || badSeqs.has(b.seq)
              return (
                <li key={b.seq} className={bad ? 'bad' : 'good'}>
                  <span className="timeline__dot" aria-label={bad ? 'Alterado' : 'Íntegro'}>{bad ? '!' : <Check size={16} />}</span>
                  <div>
                    <strong>{aliasLabel(b.alias)}</strong> <span className="muted">· lance #{b.seq}</span>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{formatDateTimeSec(b.createdAt)}</div>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}><Hash value={b.hash} /><span className="muted" style={{ fontSize: '0.75rem' }}>← encadeado a {b.prevHash.slice(0, 6)}…</span></div>
                  </div>
                  <strong className="money">{formatMoney(b.amountCents)}</strong>
                </li>
              )
            })}
          </ol>
        )}
        {data.headHash && <p className="muted" style={{ marginTop: 10, fontSize: '0.85rem' }}>Último elo da corrente: <Hash value={data.headHash} /></p>}
      </Card>

      <details className="explain">
        <summary>Como funciona a verificação?</summary>
        <p>Cada lance é registrado com uma assinatura criptográfica (HMAC-SHA256) calculada sobre o lote, o número do lance, o autor, o valor, o horário e a assinatura do lance anterior. Assim, os lances formam uma corrente.</p>
        <ul>
          <li>Alterar um lance muda a assinatura dele e quebra a corrente.</li>
          <li>Remover um lance deixa um buraco na sequência.</li>
          <li>Inserir um lance exigiria a chave secreta, que só o servidor possui.</li>
          <li>Os termos do lote (preço inicial, incremento, prazos) ficam amarrados ao primeiro elo.</li>
          <li>Lotes encerrados também são conferidos contra o livro-caixa e o comprovante.</li>
        </ul>
        <p>Privacidade: licitantes aparecem apenas como pseudônimos válidos dentro deste lote. Nenhum dado pessoal é exibido. Lote encerrado em {formatDateTime(data.lot.endsAt)}.</p>
      </details>
    </div>
  )
}
