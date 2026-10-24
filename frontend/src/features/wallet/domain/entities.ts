export interface Wallet {
  totalCents: number
  committedCents: number
  availableCents: number
  leading: { lotId: number; title: string; amountCents: number }[]
  transactions: WalletTransaction[]
}
export interface WalletTransaction {
  id: number
  kind: 'deposit' | 'purchase' | 'sale'
  amountCents: number
  lotId: number | null
  lotTitle: string | null
  createdAt: string
}
export const MIN_DEPOSIT_CENTS = 100
export const MAX_DEPOSIT_CENTS = 100_000_000
