import { Link } from 'react-router-dom'

export interface TabItem { key: string; label: string; to?: string }

/** Tab bar: pass `to` to render links (route/URL driven), or `onChange` for local state. */
export function Tabs({ items, active, onChange, label }: { items: TabItem[]; active: string; onChange?: (key: string) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) =>
        t.to ? (
          <Link key={t.key} to={t.to} replace className={`tab ${active === t.key ? 'active' : ''}`} role="tab" aria-selected={active === t.key}>{t.label}</Link>
        ) : (
          <button key={t.key} className="tab" role="tab" aria-selected={active === t.key} onClick={() => onChange?.(t.key)}>{t.label}</button>
        ),
      )}
    </div>
  )
}
