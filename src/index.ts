import dotenv from 'dotenv'
import FeedGenerator from './server'
import { maybeStr, maybeInt, maybeBoolean } from './util/helpers'

const run = async () => {
  dotenv.config()
  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  const cfg = {
    port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? 'localhost',
    sqliteLocation: maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? ':memory:',
    firehoseEnabled: maybeBoolean(process.env.FEEDGEN_FIREHOSE_ENABLED),
    localFirehose: maybeBoolean(process.env.FEEDGEN_LOCAL_FIREHOSE),
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.network',
    publisherDid:
      maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? 'did:example:alice',
    subscriptionReconnectDelay:
      maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    cacheTimeout:
      maybeInt(process.env.FEEDGEN_CACHE_TIMEOUT) ?? 24 * 60 * 60 * 1000,
    maxInterval: maybeInt(process.env.FEEDGEN_MAX_INTERVAL) ?? 7,
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
    gcsKeyFile: maybeStr(process.env.GCS_KEY_FILE) ?? '',
    gcsProjectId: maybeStr(process.env.GCS_PROJECT_ID) ?? '',
    gcsBucket: maybeStr(process.env.GCS_BUCKET) ?? '',
    httpLogEnabled: maybeBoolean(process.env.HTTP_LOG_ENABLED),
    httpLogFormat: maybeStr(process.env.HTTP_LOG_FORMAT) ?? 'combined',
  }

  const server = FeedGenerator.create(cfg)
  await server.start()
  console.log(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

run()
