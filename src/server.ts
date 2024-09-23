import http from 'http'
import path from 'path'
import events from 'events'
import express from 'express'
import cors from 'cors'
import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { HandleResolver, DidResolver, MemoryCache } from '@atproto/identity'
import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import { AuthMiddleware } from './auth'
import { CacheDatabase } from './db/cache'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import wellKnown from './well-known'
import feed from './feed'
import { createUploader } from './uploader'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: Database,
    firehose: FirehoseSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
  }

  static create(cfg: Config) {
    const app = express()
    app.use(cors())
    app.use(AuthMiddleware)
    const db = createDb(cfg.sqliteLocation)
    const cacheDb = new CacheDatabase(cfg)
    const uploader = createUploader(cfg, db)

    const bq = new BigQuery({
      projectId: cfg.bigQueryProjectId,
      keyFilename: path.resolve(__dirname, cfg.bigQueryKeyFile),
    })

    const storage = new Storage({
      projectId: cfg.gcsProjectId,
      keyFilename: path.resolve(__dirname, cfg.gcsKeyFile),
    })

    const didCache = new MemoryCache()
    const handleResolver = new HandleResolver()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const firehose = new FirehoseSubscription(
      db,
      cacheDb,
      cfg,
      cfg.subscriptionEndpoint,
    )

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })

    const ctx: AppContext = {
      cfg,
      handleResolver,
      didResolver,
      storage,
      bq,
      db,
      cacheDb,
      uploader,
    }

    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))
    app.use(express.json())
    app.use(feed(ctx))

    return new FeedGenerator(app, db, firehose, cfg)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    if (this.cfg.firehoseEnabled) {
      this.firehose.run(this.cfg.subscriptionReconnectDelay)
    }
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
