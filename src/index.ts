import dotenv from 'dotenv'
import FeedGenerator from './server'
import { maybeStr, maybeInt, maybeBoolean } from './util/helpers'
import { Telegram } from './util/telegram'

const run = async () => {
  dotenv.config()
  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  const cfg = {
    port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? '0.0.0.0',
    sqliteLocation:
      maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? './data/feed.db',
    sqliteReplicaLocation:
      maybeStr(process.env.FEEDGEN_SQLITE_REPLICA_LOCATION) ?? '',
    firehoseEnabled: maybeBoolean(process.env.FEEDGEN_FIREHOSE_ENABLED),
    jetStreamDisabled: maybeBoolean(process.env.FEEDGEN_JET_STREAM_DISABLED),
    localFirehose: maybeBoolean(process.env.FEEDGEN_LOCAL_FIREHOSE),
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.network',
    jetStreamEndpoint:
      maybeStr(process.env.FEEDGEN_JET_STREAM_ENDPOINT) ??
      'wss://jetstream1.us-east.bsky.network',
    moderatorEndpoint: maybeStr(process.env.FEEDGEN_MODERATOR_ENDPOINT) ?? '',
    publisherDid:
      maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? 'did:example:alice',
    subscriptionReconnectDelay:
      maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    cacheTimeout:
      maybeInt(process.env.FEEDGEN_CACHE_TIMEOUT) ?? 24 * 60 * 60 * 1000,
    maxInterval: maybeInt(process.env.FEEDGEN_MAX_INTERVAL) ?? 7,
    cacheCleanupInterval:
      maybeInt(process.env.FEEDGEN_CACHE_CLEANUP_INTERVAL) ?? 10,
    cacheCleanupPageSize:
      maybeInt(process.env.FEEDGEN_CACHE_CLEANUP_PAGE_SIZE) ?? 10000,
    cacheDiggingDepth:
      maybeInt(process.env.FEEDGEN_CACHE_DIGGING_DEPTH) ?? 4000,
    protocol: maybeStr(process.env.FEEDGEN_PROTOCOL) ?? 'https',
    hostname,
    serviceDid,
    bigQueryEnabled: maybeBoolean(process.env.BIGQUERY_ENABLED),
    bigQueryKeyFile: maybeStr(process.env.BIGQUERY_KEY_FILE) ?? '',
    bigQueryProjectId: maybeStr(process.env.BIGQUERY_PROJECT_ID) ?? '',
    bigQueryDatasetId: maybeStr(process.env.BIGQUERY_DATASET_ID) ?? '',
    bigQueryTableId: maybeStr(process.env.BIGQUERY_TABLE_ID) ?? '',
    bigQueryRealtimeTableId:
      maybeStr(process.env.BIGQUERY_REALTIME_TABLE_ID) ?? '',
    bigQueryRealtimeEnabled: process.env.BIGQUERY_REALTIME_TABLE_ID
      ? true
      : false,
    gcsKeyFile: maybeStr(process.env.GCS_KEY_FILE) ?? 'gcs-key-file',
    gcsProjectId: maybeStr(process.env.GCS_PROJECT_ID) ?? 'gcs-project-id',
    gcsBucket: maybeStr(process.env.GCS_BUCKET) ?? 'gcs-bucket',
    httpLogEnabled: maybeBoolean(process.env.HTTP_LOG_ENABLED),
    httpLogFormat: maybeStr(process.env.HTTP_LOG_FORMAT) ?? 'combined',
  }

  const server = FeedGenerator.create(cfg)
  await server.start()

  const banner = `
    🤖 Running feed generator at http://localhost:${server.cfg.port}
    📝 Docs at http://localhost:${server.cfg.port}/api-docs
  `

  console.log(banner)

  Telegram.send(banner)
}

run()
