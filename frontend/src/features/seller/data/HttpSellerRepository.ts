import { http } from '@/core/http'
import type { ItemSearchResult, NewLotInput, SellerOverview } from '../domain/entities'
import type { SellerRepository } from '../domain/SellerRepository'

export class HttpSellerRepository implements SellerRepository {
  searchItems(q: string, page: number) {
    return http<ItemSearchResult>('/seller/items', { query: { q, page } })
  }
  async createLot(i: NewLotInput) {
    await http('/seller/lots', {
      method: 'POST',
      body: {
        external_id: i.externalId, title: i.title, start_price_cents: i.startPriceCents,
        min_increment_cents: i.minIncrementCents, starts_at: i.startsAt, ends_at: i.endsAt,
      },
    })
  }
  overview() {
    return http<SellerOverview>('/seller/lots')
  }
  async cancel(lotId: number, refund: boolean) {
    await http(`/seller/lots/${lotId}/cancel`, { method: 'POST', query: { refund: refund ? 'true' : undefined } })
  }
}
