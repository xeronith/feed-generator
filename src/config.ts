import { Database } from './db'
import { HandleResolver, DidResolver } from '@atproto/identity'

export type AppContext = {
  db: Database
  handleResolver: HandleResolver
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  firehoseEnabled: boolean
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
  subscriptionReconnectDelay: number
  bigQueryKeyFile: string
  bigQueryProjectId: string
  bigQueryDatasetId: string
  bigQueryTableId: string
}
