import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Search } from 'lucide-react'
import { sellerRepo } from '@/app/di'
import { now } from '@/core/clock'
import { toLocalInput } from '@/core/format'
import { useDebounced } from '@/core/hooks'
import { ApiError } from '@/core/http'
import { Alert, ErrorState } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input } from '@/shared/ui/Field'
import { LotImage } from '@/shared/ui/LotImage'
import { Skeleton } from '@/shared/ui/Skeleton'
import { toast } from '@/shared/ui/Toast'
import type { ExternalItem } from '../domain/entities'
import { validateLotForm } from '../domain/lotForm'
import type { LotFormErrors, LotFormValues } from '../domain/lotForm'

function defaults(): LotFormValues {
  const n = new Date(now())
  return { title: '', startPrice: '', increment: '', startsAt: toLocalInput(n), endsAt: toLocalInput(new Date(n.getTime() + 24 * 3_600_000)) }
}

function LotForm({ item, onBack, onCreated }: { item: ExternalItem; onBack: () => void; onCreated: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState<LotFormValues>(defaults)
  const [errors, setErrors] = useState<LotFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const set = (k: keyof LotFormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }))

  const create = useMutation({
    mutationFn: sellerRepo.createLot.bind(sellerRepo),
    onSuccess: () => {
      toast('Lote criado!')
      void qc.invalidateQueries({ queryKey: ['sellerLots'] })
      void qc.invalidateQueries({ queryKey: ['lots'] })
      onCreated()
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Não foi possível criar o lote.'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const r = validateLotForm(v, item.externalId, now())
    setErrors(r.errors)
    if (r.input) create.mutate(r.input)
  }

  return (
    <Card>
      <form className="preview" onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 10 }}>
          <LotImage src={item.imageUrl} title={item.title} round />
          <strong>{item.title}</strong>
          <dl className="attrs" style={{ fontSize: '0.82rem' }}>
            {Object.entries(item.attributes).slice(0, 5).map(([k, val]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{val}</dd></div>)}
          </dl>
        </div>
        <div className="stack">
          <h2>Configurar lote</h2>
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <div className="form-grid">
            <div className="full"><Input label="Título do lote (opcional)" placeholder={item.title} value={v.title} onChange={set('title')} error={errors.title} hint="Deixe em branco para usar o título do item." /></div>
            <Input label="Lance inicial" prefix="R$" inputMode="decimal" placeholder="0,00" value={v.startPrice} onChange={set('startPrice')} error={errors.startPrice} />
            <Input label="Incremento mínimo" prefix="R$" inputMode="decimal" placeholder="0,00" value={v.increment} onChange={set('increment')} error={errors.increment} />
            <Input label="Início" type="datetime-local" value={v.startsAt} onChange={set('startsAt')} error={errors.startsAt} />
            <Input label="Término" type="datetime-local" value={v.endsAt} onChange={set('endsAt')} error={errors.endsAt} />
          </div>
          <div className="row">
            <Button type="submit" loading={create.isPending}>Publicar lote</Button>
            <Button type="button" variant="ghost" onClick={onBack}>Escolher outro item</Button>
          </div>
        </div>
      </form>
    </Card>
  )
}

export function NewLotTab({ onCreated }: { onCreated: () => void }) {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 400)
  const [item, setItem] = useState<ExternalItem | null>(null)
  const { data, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['sellerItems', q],
    queryFn: ({ pageParam }) => sellerRepo.searchItems(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.flatMap((p) => p.items).length < last.total && last.items.length > 0 ? last.page + 1 : undefined),
    retry: false,
  })

  if (item) return <LotForm item={item} onBack={() => setItem(null)} onCreated={onCreated} />

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const stale = data?.pages.some((p) => p.stale)
  return (
    <div className="stack">
      <div className="search">
        <Search size={18} aria-hidden />
        <input className="input" type="search" placeholder="Buscar obras (ex.: Monet, retrato, paisagem)…" aria-label="Buscar itens na API" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {stale && <Alert tone="warning">Mostrando resultados em cache: a API externa está instável. Você ainda pode criar lotes com estes itens.</Alert>}
      {isLoading ? (
        <div className="items-grid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={190} />)}</div>
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum item encontrado" text="Tente outro termo de busca." />
      ) : (
        <>
          <div className="items-grid">
            {items.map((it) => (
              <button key={it.externalId} type="button" className="item-card" onClick={() => setItem(it)}>
                <LotImage src={it.thumbUrl ?? it.imageUrl} title={it.title} />
                <span>{it.title}</span>
              </button>
            ))}
          </div>
          {hasNextPage && <Button variant="secondary" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>Carregar mais</Button>}
        </>
      )}
    </div>
  )
}
