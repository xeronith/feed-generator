import { HandleResolver, DidResolver } from '@atproto/identity'
import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { Database } from './db'
import { CacheDatabase } from './db/cache'
import { Multer } from 'multer'

export type AppContext = {
  cfg: Config
  handleResolver: HandleResolver
  didResolver: DidResolver
  storage: Storage
  bq: BigQuery
  db: Database
  cacheDb: CacheDatabase
  uploader: Multer
}

export type Config = {
  port: number
  listenhost: string
  protocol: string
  hostname: string
  sqliteLocation: string
  sqliteReplicaLocation: string
  cacheTimeout: number
  cacheDiggingDepth: number
  cacheCleanupInterval: number
  cacheCleanupPageSize: number
  maxInterval: number
  firehoseEnabled: boolean
  localFirehose: boolean
  subscriptionEndpoint: string
  jetStreamEndpoint: string
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
  gcsKeyFile: string
  gcsProjectId: string
  gcsBucket: string
  httpLogEnabled: boolean
  httpLogFormat: string
}
