import type { HTMLAttributes } from 'react'

export function Card({ raised, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return <div className={`card ${raised ? 'card--raised' : ''} ${className}`} {...rest} />
}
