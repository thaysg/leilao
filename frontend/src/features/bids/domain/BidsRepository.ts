import type { MyBidLot, Win } from './entities'

export interface BidsRepository {
  myBids(): Promise<MyBidLot[]>
  myWins(): Promise<Win[]>
}
