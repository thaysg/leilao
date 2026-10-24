import { http } from '@/core/http'
import type { LotDetail, LotFilters, LotSummary } from '../domain/entities'
import type { LotRepository } from '../domain/LotRepository'

export class HttpLotRepository implements LotRepository {
  async list(f: LotFilters) {
    const r = await http<{ lots: LotSummary[] }>('/lots', {
      query: { state: f.state, q: f.q, min_price: f.minPriceCents, max_price: f.maxPriceCents, sort: f.sort },
    })
    return r.lots
  }
  get(id: number) {
    return http<LotDetail>(`/lots/${id}`)
  }
  placeBid(lotId: number, amountCents: number) {
    return http<LotDetail>(`/lots/${lotId}/bids`, { method: 'POST', body: { amount_cents: amountCents } })
  }
}
