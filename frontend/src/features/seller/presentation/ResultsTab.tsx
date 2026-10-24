import { Link } from 'react-router-dom'
import { Banknote, Gavel, PackageOpen } from 'lucide-react'
import { aliasLabel, formatDateTime, formatMoney } from '@/core/format'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import type { SellerOverview } from '../domain/entities'

export function ResultsTab({ data }: { data: SellerOverview }) {
  const ended = data.lots.filter((l) => l.state === 'ended' && !l.cancelled)
  const sold = ended.filter((l) => l.hasWinner)
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="tiles">
        <Card className="tile tile--hero"><small>Total recebido</small><strong className="money">{formatMoney(data.totalReceivedCents)}</strong></Card>
        <Card className="tile"><small>Lotes vendidos</small><strong>{sold.length}</strong></Card>
        <Card className="tile"><small>Encerrados sem lances</small><strong>{ended.length - sold.length}</strong></Card>
      </div>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Resultado dos lotes encerrados</h3>
        {ended.length === 0 ? (
          <EmptyState icon={<PackageOpen size={32} />} title="Nenhum lote encerrado ainda" text="Quando seus lotes terminarem, o resultado aparece aqui." />
        ) : (
          <ul className="tx">
            {ended.map((l) => (
              <li key={l.id}>
                <span className="tx__icon">{l.hasWinner ? <Banknote size={18} /> : <Gavel size={18} />}</span>
                <div className="tx__main">
                  <Link to={`/lotes/${l.id}`}>{l.title}</Link>
                  <small>{l.hasWinner ? `Arrematado por ${l.winnerAlias ? aliasLabel(l.winnerAlias) : 'um licitante'}` : 'Encerrado sem lances'} · {formatDateTime(l.endsAt)}</small>
                </div>
                {l.hasWinner && <strong className="money pos">{formatMoney(l.finalCents ?? 0)}</strong>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
