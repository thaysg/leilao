import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export function Badge({ tone = 'neutral', dot, pulse, children }: { tone?: Tone; dot?: boolean; pulse?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${tone !== 'neutral' ? `badge--${tone}` : ''}`}>
      {dot && <span className={`dot ${pulse ? 'dot--pulse' : ''}`} aria-hidden />}
      {children}
    </span>
  )
}
