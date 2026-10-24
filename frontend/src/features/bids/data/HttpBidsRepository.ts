import { http } from '@/core/http'
import type { BidsRepository } from '../domain/BidsRepository'
import type { MyBidLot, Win } from '../domain/entities'

export class HttpBidsRepository implements BidsRepository {
  async myBids() {
    return (await http<{ lots: MyBidLot[] }>('/me/bids')).lots
  }
  async myWins() {
    return (await http<{ wins: Win[] }>('/me/wins')).wins
  }
}
