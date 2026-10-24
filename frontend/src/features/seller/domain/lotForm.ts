import { parseMoney } from '@/core/format'
import type { NewLotInput } from './entities'

export interface LotFormValues {
  title: string
  startPrice: string
  increment: string
  startsAt: string // datetime-local
  endsAt: string
}
export type LotFormErrors = Partial<Record<keyof LotFormValues, string>>

/** Validates the form and returns either errors or the API-ready payload. `now` is injectable for tests. */
export function validateLotForm(
  v: LotFormValues,
  externalId: string,
  nowMs: number,
): { errors: LotFormErrors; input?: NewLotInput } {
  const errors: LotFormErrors = {}
  const start = parseMoney(v.startPrice)
  const inc = parseMoney(v.increment)
  if (!start || start <= 0) errors.startPrice = 'Informe um lance inicial maior que zero.'
  if (!inc || inc <= 0) errors.increment = 'Informe um incremento mínimo maior que zero.'
  const s = Date.parse(v.startsAt)
  const e = Date.parse(v.endsAt)
  if (Number.isNaN(s)) errors.startsAt = 'Informe a data de início.'
  if (Number.isNaN(e)) errors.endsAt = 'Informe a data de término.'
  if (!errors.endsAt && e <= nowMs) errors.endsAt = 'O término precisa estar no futuro.'
  else if (!errors.startsAt && !errors.endsAt && e - s < 60_000) errors.endsAt = 'O lote precisa durar pelo menos 1 minuto.'
  if (v.title.trim() && v.title.trim().length < 2) errors.title = 'O título precisa ter ao menos 2 letras.'
  if (Object.keys(errors).length) return { errors }
  return {
    errors,
    input: {
      externalId,
      title: v.title.trim() || undefined,
      startPriceCents: start!,
      minIncrementCents: inc!,
      startsAt: new Date(s).toISOString(),
      endsAt: new Date(e).toISOString(),
    },
  }
}
