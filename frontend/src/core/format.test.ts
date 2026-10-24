import { describe, expect, it } from 'vitest'
import { getOffset, now, resetClock, syncServerTime } from './clock'
import { camelize } from './http'
import { centsToInput, formatDuration, formatMoney, parseMoney } from './format'

describe('money', () => {
  it('formats cents as BRL', () => {
    expect(formatMoney(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
  })
  it('parses pt-BR and en inputs into cents', () => {
    expect(parseMoney('1.234,56')).toBe(123456)
    expect(parseMoney('R$ 1500')).toBe(150000)
    expect(parseMoney('99,9')).toBe(9990)
    expect(parseMoney('1234.56')).toBe(123456)
    expect(parseMoney('1.234')).toBe(123400)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
  it('round-trips through the input format', () => {
    expect(parseMoney(centsToInput(150000))).toBe(150000)
  })
})

describe('formatDuration', () => {
  it('formats minutes, hours and days', () => {
    expect(formatDuration(93_000)).toBe('01:33')
    expect(formatDuration(3_700_000)).toBe('01:01:40')
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000 + 12 * 60_000 + 45_000)).toBe('2d 03:12:45')
    expect(formatDuration(-5)).toBe('00:00')
  })
})

describe('server clock', () => {
  it('applies the server offset', () => {
    resetClock()
    syncServerTime(new Date(Date.now() + 60_000).toISOString())
    expect(Math.abs(getOffset() - 60_000)).toBeLessThan(200)
    expect(Math.abs(now() - (Date.now() + 60_000))).toBeLessThan(200)
    resetClock()
  })
})

describe('camelize', () => {
  it('converts nested snake_case keys', () => {
    expect(camelize<{ aB: { cD: number[] } }>({ a_b: { c_d: [1] } })).toEqual({ aB: { cD: [1] } })
  })
})
