import { Database } from './db'
import SqliteDb from 'better-sqlite3'
import { HandleResolver, DidResolver } from '@atproto/identity'

export type AppContext = {
  db: Database
  cacheDb: SqliteDb.Database
  handleResolver: HandleResolver
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  protocol: string
  hostname: string
  sqliteLocation: string
  cacheTimeout: number
  maxInterval: number
  firehoseEnabled: boolean
  localFirehose: boolean
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
  subscriptionReconnectDelay: number
  bigQueryEnabled: boolean
  bigQueryKeyFile: string
  bigQueryProjectId: string
  bigQueryDatasetId: string
  bigQueryTableId: string
  bigQueryRealtimeTableId: string
  bigQueryRealtimeEnabled: boolean
}
