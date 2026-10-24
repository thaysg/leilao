import { Tabs } from '@/shared/ui/Tabs'

export function BidsTabs({ active }: { active: 'bids' | 'wins' }) {
  return (
    <Tabs label="Meus lances e arremates" active={active}
      items={[{ key: 'bids', label: 'Meus lances', to: '/meus-lances' }, { key: 'wins', label: 'Arremates', to: '/meus-arremates' }]} />
  )
}
