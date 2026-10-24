import type { LotSummary } from '@/features/lots/domain/entities'

export interface AuditBid { seq: number; alias: string; amountCents: number; createdAt: string; hash: string; prevHash: string; ok: boolean }
export interface AuditIssue { code: string; message: string; seq: number | null }
export interface AuditResult {
  lot: LotSummary
  checkedAt: string
  intact: boolean
  issues: AuditIssue[]
  bidCount: number
  headHash: string | null
  genesisHash: string
  bids: AuditBid[]
}
export interface Receipt {
  code: string
  lotId: number
  title: string
  imageUrl: string | null
  attributes: Record<string, string>
  sellerName: string
  winnerAlias: string
  amountCents: number
  bidCount: number
  headHash: string
  issuedAt: string
}
