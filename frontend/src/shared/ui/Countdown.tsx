import { useEffect, useRef } from 'react'
import { useNow } from '@/core/hooks'
import { formatDuration } from '@/core/format'

interface Props {
  endsAt: string
  onEnd?: () => void
  urgentBelowMs?: number
}

/** Counts down to `endsAt` using the server-synced clock. Calls onEnd once when it reaches zero. */
export function Countdown({ endsAt, onEnd, urgentBelowMs = 120_000 }: Props) {
  const nowMs = useNow(250)
  const left = Date.parse(endsAt) - nowMs
  const fired = useRef(false)

  useEffect(() => { fired.current = false }, [endsAt])
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true
      onEnd?.()
    }
  }, [left, onEnd])

  const cls = left <= 0 ? 'countdown--over' : left < urgentBelowMs ? 'countdown--urgent' : ''
  return <span className={`countdown ${cls}`} role="timer">{left <= 0 ? '00:00' : formatDuration(left)}</span>
}
