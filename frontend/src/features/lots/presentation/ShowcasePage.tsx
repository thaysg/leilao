import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Gavel, Search, SlidersHorizontal } from 'lucide-react'
import { parseMoney } from '@/core/format'
import { useDebounced } from '@/core/hooks'
import { ApiError } from '@/core/http'
import { ErrorState } from '@/shared/ui/Alert'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input, Select } from '@/shared/ui/Field'
import { Button } from '@/shared/ui/Button'
import { Tabs } from '@/shared/ui/Tabs'
import type { LotFilters, LotSort } from '../domain/entities'
import { useLots } from './hooks'
import { LotCard, LotCardSkeleton } from './LotCard'

type State = LotFilters['state']
const TABS: { key: State; label: string }[] = [
  { key: 'live', label: 'Ao vivo' },
  { key: 'scheduled', label: 'Agendados' },
  { key: 'ended', label: 'Encerrados' },
]
const EMPTY_TEXT: Record<State, string> = {
  live: 'Não há lotes ao vivo neste momento. Veja os agendados ou volte em instantes.',
  scheduled: 'Nenhum lote agendado por enquanto.',
  ended: 'Ainda não há lotes encerrados.',
}

export function ShowcasePage() {
  const [params, setParams] = useSearchParams()
  const state = (TABS.find((t) => t.key === params.get('state'))?.key ?? 'live') as State
  const q = params.get('q') ?? ''
  const sort = (params.get('sort') ?? 'default') as LotSort
  const min = params.get('min') ?? ''
  const max = params.get('max') ?? ''

  const [text, setText] = useState(q)
  const debounced = useDebounced(text, 300)
  const [showFilters, setShowFilters] = useState(Boolean(min || max))

  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
  }
  useEffect(() => { if (debounced !== q) patch({ q: debounced }) }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const filters: LotFilters = {
    state, q: q || undefined, sort,
    minPriceCents: min ? parseMoney(min) ?? undefined : undefined,
    maxPriceCents: max ? parseMoney(max) ?? undefined : undefined,
  }
  const { data, isLoading, isError, error, refetch } = useLots(filters)

  return (
    <>
      <section className="hero">
        <h1>Leilões ao vivo</h1>
        <p>Obras de arte de um acervo real. Dê lances em tempo real e confira a integridade de cada lote.</p>
      </section>

      <div className="toolbar">
        <div className="toolbar__row">
          <Tabs label="Situação dos lotes" active={state} items={TABS.map((t) => ({ ...t, to: `/?${new URLSearchParams({ ...Object.fromEntries(params), state: t.key })}` }))} />
        </div>
        <div className="toolbar__row">
          <div className="search">
            <Search size={18} aria-hidden />
            <input className="input" type="search" placeholder="Buscar por título, artista, técnica…" aria-label="Buscar lotes" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div style={{ minWidth: 190 }}>
            <Select label="Ordenar" aria-label="Ordenar lotes" value={sort} onChange={(e) => patch({ sort: e.target.value === 'default' ? '' : e.target.value })}>
              <option value="default">Relevância</option>
              <option value="newest">Mais recentes</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
            </Select>
          </div>
          <Button variant="secondary" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}><SlidersHorizontal size={16} /> Preço</Button>
        </div>
        {showFilters && (
          <div className="filters">
            <Input label="Preço mínimo" prefix="R$" inputMode="decimal" value={min} onChange={(e) => patch({ min: e.target.value })} />
            <Input label="Preço máximo" prefix="R$" inputMode="decimal" value={max} onChange={(e) => patch({ max: e.target.value })} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid-lots">{Array.from({ length: 6 }, (_, i) => <LotCardSkeleton key={i} />)}</div>
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
      ) : data && data.length > 0 ? (
        <div className="grid-lots">{data.map((l) => <LotCard key={l.id} lot={l} />)}</div>
      ) : (
        <EmptyState icon={<Gavel size={36} />} title={q ? 'Nenhum lote encontrado' : 'Nada por aqui'} text={q ? 'Tente outro termo ou limpe os filtros.' : EMPTY_TEXT[state]} />
      )}
    </>
  )
}
