import type { ItemSearchResult, NewLotInput, SellerOverview } from './entities'

export interface SellerRepository {
  searchItems(q: string, page: number): Promise<ItemSearchResult>
  createLot(input: NewLotInput): Promise<void>
  overview(): Promise<SellerOverview>
  cancel(lotId: number, refund: boolean): Promise<void>
}
