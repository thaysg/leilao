import type { LotDetail, LotFilters, LotSummary } from './entities'

export interface LotRepository {
  list(filters: LotFilters): Promise<LotSummary[]>
  get(id: number): Promise<LotDetail>
  placeBid(lotId: number, amountCents: number): Promise<LotDetail>
}
