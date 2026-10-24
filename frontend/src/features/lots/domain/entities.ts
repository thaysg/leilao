export type LotState = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type MyStatus = 'none' | 'leading' | 'outbid' | 'won' | 'lost'

export interface LotSummary {
  id: number
  title: string
  imageUrl: string | null
  state: LotState
  startPriceCents: number
  minIncrementCents: number
  currentCents: number | null
  bidCount: number
  minNextBidCents: number
  startsAt: string
  endsAt: string
  sellerName: string
  finalCents: number | null
  hasWinner: boolean
}

export interface MyLotStatus {
  status: MyStatus
  position: number | null
  bestBidCents: number | null
  alias: string | null
  bidCount: number
}

export interface BidEntry { seq: number; alias: string; amountCents: number; createdAt: string; isMine: boolean }

export interface LotDetail extends LotSummary {
  description: string
  attributes: Record<string, string>
  serverTime: string
  originalEndsAt: string
  extended: boolean
  me: MyLotStatus
  bids: BidEntry[]
  winnerAlias: string | null
  receiptCode: string | null
  isOwner: boolean
}

export type LotSort = 'default' | 'price_asc' | 'price_desc' | 'newest'

export interface LotFilters {
  state: 'live' | 'scheduled' | 'ended'
  q?: string
  minPriceCents?: number
  maxPriceCents?: number
  sort?: LotSort
}
