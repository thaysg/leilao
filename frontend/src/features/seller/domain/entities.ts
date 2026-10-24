import type { LotSummary } from '@/features/lots/domain/entities'

export interface ExternalItem {
  externalId: string
  title: string
  imageUrl: string | null
  thumbUrl: string | null
  description: string
  attributes: Record<string, string>
  source: string
}
export interface ItemSearchResult { items: ExternalItem[]; total: number; stale: boolean; page: number }

export interface NewLotInput {
  externalId: string
  title?: string
  startPriceCents: number
  minIncrementCents: number
  startsAt: string // ISO with timezone
  endsAt: string
}

export interface SellerLot extends LotSummary {
  cancelled: boolean
  cancelledWithRefund: boolean
  winnerAlias: string | null
  canCancel: boolean
}
export interface SellerOverview { totalReceivedCents: number; balanceCents: number; lots: SellerLot[] }
