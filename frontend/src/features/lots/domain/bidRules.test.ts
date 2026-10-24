import { describe, expect, it } from 'vitest'
import { bidErrorView, quickBidOptions } from './bidRules'

const money = (c: number) => `R$${c / 100}`

describe('bid rules', () => {
  it('suggests the minimum and two higher steps', () => {
    expect(quickBidOptions({ minNextBidCents: 10000, minIncrementCents: 1000 })).toEqual([10000, 11000, 14000])
  })
  it('maps below_minimum using the server minimum', () => {
    const v = bidErrorView({ code: 'below_minimum', message: 'x', extra: { minNextBidCents: 11000 } }, money)
    expect(v.message).toContain('R$110')
  })
  it('offers a deposit action on insufficient balance', () => {
    expect(bidErrorView({ code: 'insufficient_balance', message: 'x', extra: { availableCents: 500 } }, money).action).toBe('deposit')
  })
  it('asks to log in on unauthorized', () => {
    expect(bidErrorView({ code: 'unauthorized', message: 'x', extra: {} }, money).action).toBe('login')
  })
  it('falls back to the server message', () => {
    expect(bidErrorView({ code: 'weird', message: 'from server', extra: {} }, money).message).toBe('from server')
  })
})
