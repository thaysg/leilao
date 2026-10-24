import { http } from '@/core/http'
import type { Wallet } from '../domain/entities'
import type { WalletRepository } from '../domain/WalletRepository'

export class HttpWalletRepository implements WalletRepository {
  get() {
    return http<Wallet>('/wallet')
  }
  async deposit(amountCents: number) {
    await http('/wallet/deposit', { method: 'POST', body: { amount_cents: amountCents } })
  }
}
