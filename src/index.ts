import dotenv from 'dotenv'
import FeedGenerator from './server'

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
    bigQueryEnabled: process.env.BIGQUERY_KEY_FILE ? true : false,
    bigQueryKeyFile: maybeStr(process.env.BIGQUERY_KEY_FILE) ?? '',
    bigQueryProjectId: maybeStr(process.env.BIGQUERY_PROJECT_ID) ?? '',
    bigQueryDatasetId: maybeStr(process.env.BIGQUERY_DATASET_ID) ?? '',
    bigQueryTableId: maybeStr(process.env.BIGQUERY_TABLE_ID) ?? '',
  }

  const server = FeedGenerator.create(cfg)
  await server.start()
  console.log(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

const maybeBoolean = (val?: string) => {
  if (!val) return false
  return val === 'true'
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()
