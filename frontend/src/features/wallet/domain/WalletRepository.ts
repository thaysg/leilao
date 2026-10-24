import type { Wallet } from './entities'

export interface WalletRepository {
  get(): Promise<Wallet>
  deposit(amountCents: number): Promise<void>
}
