import type { LotDetail } from '@/features/lots/domain/entities'

export type MyBidLot = Omit<LotDetail, 'bids'>
export interface Win { code: string; lotId: number; title: string; imageUrl: string | null; amountCents: number; issuedAt: string }
