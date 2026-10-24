import type { LotDetail } from './entities'

export function quickBidOptions(lot: Pick<LotDetail, 'minNextBidCents' | 'minIncrementCents'>): number[] {
  const { minNextBidCents: min, minIncrementCents: inc } = lot
  return [min, min + inc, min + 4 * inc]
}

export interface BidErrorView { message: string; action?: 'deposit' | 'login' }

/** Maps API error codes to the message shown next to the bid form. The server always has the last word. */
export function bidErrorView(
  err: { code: string; message: string; extra: Record<string, unknown> },
  money: (cents: number) => string,
): BidErrorView {
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  switch (err.code) {
    case 'below_minimum': {
      const min = num(err.extra.minNextBidCents)
      return { message: min !== null ? `Lance abaixo do mínimo. O próximo lance deve ser de pelo menos ${money(min)}.` : err.message }
    }
    case 'insufficient_balance': {
      const av = num(err.extra.availableCents)
      return { message: `Saldo disponível insuficiente${av !== null ? ` (você tem ${money(av)})` : ''}.`, action: 'deposit' }
    }
    case 'already_leading': return { message: 'Você já está ganhando este lote. Aguarde ser superado para dar um novo lance.' }
    case 'lot_not_started': return { message: 'Este lote ainda não foi iniciado.' }
    case 'lot_ended': return { message: 'Este lote já foi encerrado.' }
    case 'lot_cancelled': return { message: 'Este lote foi cancelado.' }
    case 'seller_cannot_bid': return { message: 'Leiloeiros não podem dar lances.' }
    case 'unauthorized': return { message: 'Entre na sua conta para dar lances.', action: 'login' }
    default: return { message: err.message }
  }
}
