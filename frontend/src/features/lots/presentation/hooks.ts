import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { lotRepo } from '@/app/di'
import type { LotFilters } from '../domain/entities'

export function useLots(filters: LotFilters) {
  return useQuery({
    queryKey: ['lots', filters],
    queryFn: () => lotRepo.list(filters),
    refetchInterval: filters.state === 'live' ? 10_000 : false, // the showcase polls; the room uses WebSocket
    placeholderData: keepPreviousData,
  })
}

export function useLot(id: number, pollMs: number | false) {
  return useQuery({
    queryKey: ['lot', id],
    queryFn: () => lotRepo.get(id),
    refetchInterval: pollMs,
    enabled: Number.isFinite(id),
  })
}
