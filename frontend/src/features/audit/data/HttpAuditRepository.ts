import { http } from '@/core/http'
import type { AuditRepository } from '../domain/AuditRepository'
import type { AuditResult, Receipt } from '../domain/entities'

export class HttpAuditRepository implements AuditRepository {
  audit(lotId: number) {
    return http<AuditResult>(`/lots/${lotId}/audit`)
  }
  receipt(code: string) {
    return http<Receipt>(`/receipts/${encodeURIComponent(code)}`)
  }
}
