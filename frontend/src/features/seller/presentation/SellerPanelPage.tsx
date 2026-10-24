import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { sellerRepo } from '@/app/di'
import { ApiError } from '@/core/http'
import { ErrorState } from '@/shared/ui/Alert'
import { Skeleton } from '@/shared/ui/Skeleton'
import { Tabs } from '@/shared/ui/Tabs'
import { MyLotsTab } from './MyLotsTab'
import { NewLotTab } from './NewLotTab'
import { ResultsTab } from './ResultsTab'

const TABS = [{ key: 'new', label: 'Novo lote' }, { key: 'lots', label: 'Meus lotes' }, { key: 'results', label: 'Resultados' }]

export function SellerPanelPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'lots'
  const go = (key: string) => setParams({ tab: key }, { replace: true })
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['sellerLots'], queryFn: () => sellerRepo.overview(), refetchInterval: 15_000 })

  return (
    <>
      <div className="page-head"><h1>Painel do leiloeiro</h1><p>Crie lotes a partir de itens de um acervo público, acompanhe e veja os resultados.</p></div>
      <div className="stack">
        <Tabs label="Seções do painel" active={tab} onChange={go} items={TABS} />
        {tab === 'new' ? (
          <NewLotTab onCreated={() => go('lots')} />
        ) : isLoading ? (
          <div className="list">{[0, 1, 2].map((i) => <Skeleton key={i} h={96} />)}</div>
        ) : isError || !data ? (
          <ErrorState message={error instanceof ApiError ? error.message : 'Erro inesperado.'} onRetry={() => void refetch()} />
        ) : tab === 'lots' ? (
          <MyLotsTab lots={data.lots} onNew={() => go('new')} />
        ) : (
          <ResultsTab data={data} />
        )}
      </div>
    </>
  )
}
