import { useState } from 'react'

const initials = (title: string) => title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

/** Lot picture with a tasteful placeholder when the image is missing or fails to load (e.g. museum site down). */
export function LotImage({ src, title, round, priority }: { src: string | null; title: string; round?: boolean; priority?: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`lot-image ${round ? 'lot-image--round' : ''}`}>
      {src && !failed ? (
        <img src={src} alt={title} loading={priority ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
      ) : (
        <div className="lot-image__ph" role="img" aria-label={`Sem imagem: ${title}`}>{initials(title)}</div>
      )}
    </div>
  )
}
