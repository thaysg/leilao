import type { AuditResult, Receipt } from './entities'

export interface AuditRepository {
  audit(lotId: number): Promise<AuditResult>
  receipt(code: string): Promise<Receipt>
}
