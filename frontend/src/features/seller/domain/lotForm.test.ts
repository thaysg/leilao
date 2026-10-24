import { describe, expect, it } from 'vitest'
import { validateLotForm } from './lotForm'

const base = { title: '', startPrice: '1.000,00', increment: '50', startsAt: '2030-01-01T10:00', endsAt: '2030-01-02T10:00' }
const NOW = Date.parse('2029-12-31T00:00:00')

describe('validateLotForm', () => {
  it('builds the API payload in cents and ISO dates', () => {
    const r = validateLotForm(base, '7', NOW)
    expect(r.errors).toEqual({})
    expect(r.input).toMatchObject({ externalId: '7', startPriceCents: 100000, minIncrementCents: 5000 })
    expect(r.input?.endsAt).toMatch(/Z$/)
  })
  it('rejects non-positive amounts and bad windows', () => {
    expect(validateLotForm({ ...base, startPrice: '0' }, '7', NOW).errors.startPrice).toBeTruthy()
    expect(validateLotForm({ ...base, endsAt: '2029-01-01T10:00' }, '7', NOW).errors.endsAt).toBeTruthy()
    expect(validateLotForm({ ...base, endsAt: '2030-01-01T10:00:30' }, '7', NOW).errors.endsAt).toBeTruthy()
  })
})
