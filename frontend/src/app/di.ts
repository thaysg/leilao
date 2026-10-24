// Composition root: the only place that knows the concrete (HTTP) implementations.
// Presentation code imports these instances typed by their domain interfaces.
import type { AuditRepository } from '@/features/audit/domain/AuditRepository'
import { HttpAuditRepository } from '@/features/audit/data/HttpAuditRepository'
import type { AuthRepository } from '@/features/auth/domain/AuthRepository'
import { HttpAuthRepository } from '@/features/auth/data/HttpAuthRepository'
import type { BidsRepository } from '@/features/bids/domain/BidsRepository'
import { HttpBidsRepository } from '@/features/bids/data/HttpBidsRepository'
import type { LotRepository } from '@/features/lots/domain/LotRepository'
import { HttpLotRepository } from '@/features/lots/data/HttpLotRepository'
import type { SellerRepository } from '@/features/seller/domain/SellerRepository'
import { HttpSellerRepository } from '@/features/seller/data/HttpSellerRepository'
import type { WalletRepository } from '@/features/wallet/domain/WalletRepository'
import { HttpWalletRepository } from '@/features/wallet/data/HttpWalletRepository'

export const authRepo: AuthRepository = new HttpAuthRepository()
export const lotRepo: LotRepository = new HttpLotRepository()
export const walletRepo: WalletRepository = new HttpWalletRepository()
export const bidsRepo: BidsRepository = new HttpBidsRepository()
export const sellerRepo: SellerRepository = new HttpSellerRepository()
export const auditRepo: AuditRepository = new HttpAuditRepository()
