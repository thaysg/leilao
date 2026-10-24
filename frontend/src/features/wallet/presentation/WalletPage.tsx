import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Crown, PiggyBank, Receipt } from 'lucide-react'
import { walletRepo } from '@/app/di'
import { formatDateTime, formatMoney, parseMoney } from '@/core/format'
import { ApiError } from '@/core/http'
import { Alert, ErrorState } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Input } from '@/shared/ui/Field'
import { Skeleton } from '@/shared/ui/Skeleton'
import { toast } from '@/shared/ui/Toast'
import { MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from '../domain/entities'
import type { WalletTransaction } from '../domain/entities'

const QUICK = [10_000, 50_000, 100_000, 500_000]
const KIND: Record<WalletTransaction['kind'], { label: string; icon: typeof Receipt }> = {
  deposit: { label: 'Depósito simulado', icon: ArrowDownLeft },
  purchase: { label: 'Compra', icon: Receipt },
  sale: { label: 'Venda', icon: ArrowUpRight },
}

export function WalletPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['wallet'], queryFn: () => walletRepo.get() })
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const deposit = useMutation({
    mutationFn: (cents: number) => walletRepo.deposit(cents),
    onSuccess: () => { setValue(''); setErr(null); toast('Depósito realizado.'); void qc.invalidateQueries({ queryKey: ['wallet'] }) },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Não foi possível depositar.'),
  })

  function submit(e: FormEvent, cents = parseMoney(value)) {
    e.preventDefault()
    if (cents === null || cents < MIN_DEPOSIT_CENTS || cents > MAX_DEPOSIT_CENTS) return setErr('Informe um valor entre R$ 1,00 e R$ 1.000.000,00.')
    setErr(null)
    deposit.mutate(cents)
  }

  return (
    <>
      <div className="page-head"><h1>Carteira</h1><p>Seu saldo para participar dos leilões. O depósito é simulado, nenhum dinheiro real é movimentado.</p></div>

      {isLoading ? (
        <div className="tiles">{[0, 1, 2].map((i) => <Skeleton key={i} h={96} />)}</div>
      ) : isError || !data ? (
        <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
      ) : (
        <div className="stack" style={{ gap: 24 }}>
          <div className="tiles">
            <Card className="tile"><small>Saldo total</small><strong className="money">{formatMoney(data.totalCents)}</strong></Card>
            <Card className="tile"><small>Saldo comprometido</small><strong className="money">{formatMoney(data.committedCents)}</strong><small>Reservado nos lotes em que você está ganhando</small></Card>
            <Card className="tile tile--hero"><small>Saldo disponível</small><strong className="money">{formatMoney(data.availableCents)}</strong><small>Total − comprometido</small></Card>
          </div>

          {data.leading.length > 0 && (
            <Card>
              <h3 style={{ marginBottom: 8 }}>Lotes em que você está ganhando</h3>
              <ul className="tx">
                {data.leading.map((l) => (
                  <li key={l.lotId}>
                    <span className="tx__icon"><Crown size={18} /></span>
                    <div className="tx__main"><Link to={`/lotes/${l.lotId}`}>{l.title}</Link></div>
                    <strong className="money">{formatMoney(l.amountCents)}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <form className="stack" onSubmit={submit} noValidate style={{ gap: 12 }}>
              <div className="row"><PiggyBank size={20} aria-hidden /><h3>Depositar saldo (simulado)</h3></div>
              <div className="chips">{QUICK.map((c) => <button type="button" key={c} disabled={deposit.isPending} onClick={(e) => submit(e, c)}>{formatMoney(c)}</button>)}</div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 200px' }}><Input label="Outro valor" prefix="R$" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => { setValue(e.target.value); setErr(null) }} error={err} /></div>
                <Button type="submit" loading={deposit.isPending} style={{ marginTop: 24 }}>Depositar</Button>
              </div>
            </form>
          </Card>

          <Card>
            <h3 style={{ marginBottom: 8 }}>Movimentações</h3>
            {data.transactions.length === 0 ? (
              <EmptyState title="Sem movimentações" text="Seus depósitos e compras aparecerão aqui." />
            ) : (
              <ul className="tx">
                {data.transactions.map((t) => {
                  const k = KIND[t.kind]
                  return (
                    <li key={t.id}>
                      <span className="tx__icon"><k.icon size={18} /></span>
                      <div className="tx__main">
                        {t.lotId ? <Link to={`/lotes/${t.lotId}`}>{t.lotTitle ?? k.label}</Link> : <span>{k.label}</span>}
                        <small>{k.label} · {formatDateTime(t.createdAt)}</small>
                      </div>
                      <strong className={`money ${t.amountCents >= 0 ? 'pos' : 'neg'}`}>{t.amountCents >= 0 ? '+' : '−'}{formatMoney(Math.abs(t.amountCents))}</strong>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <Alert tone="info">Quando você é superado em um lote, o valor reservado volta ao saldo disponível imediatamente.</Alert>
        </div>
      )}
    </>
  )
}
