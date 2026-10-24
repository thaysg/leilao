import { useEffect, useState } from 'react'
import { now } from './clock'

/** Server-synced "now" in ms, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [t, setT] = useState(now())
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return t
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}
