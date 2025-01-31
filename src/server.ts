import http from 'http'
import path from 'path'
import events from 'events'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import cors from 'cors'
import morgan from 'morgan'
import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { HandleResolver, DidResolver, MemoryCache } from '@atproto/identity'
import { ApplicationDatabase } from './db'
import { FirehoseSubscription } from './subscription'
import { JetStreamSubscription } from './jetstream'
import { AppContext, Config } from './config'
import { AuthMiddleware } from './auth'
import { CacheDatabase } from './db/cache'
import { createServer } from './lexicon'
import { openapiSpecification } from './swagger'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import wellKnown from './well-known'
import feed from './feed'
import collection from './collection'
import waitList from './wait-list'
import log, { LogMiddleware } from './log'
import { createUploader } from './uploader'
import { CronJob } from 'cron'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  private db: ApplicationDatabase
  public firehose: FirehoseSubscription
  public jetStream: JetStreamSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: ApplicationDatabase,
    firehose: FirehoseSubscription,
    jetStream: JetStreamSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.firehose = firehose
    this.jetStream = jetStream
    this.cfg = cfg
  }

  static create(cfg: Config) {
    const app = express()
    app.use(cors())
    app.use(AuthMiddleware)
    app.use(LogMiddleware)
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification))

    if (cfg.httpLogEnabled) {
      app.use(morgan(cfg.httpLogFormat))
    }

    const db = new ApplicationDatabase(cfg)
    const cacheDb = new CacheDatabase(cfg)
    const uploader = createUploader(cfg, db.get())

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
      db.get(),
      cacheDb,
      cfg,
      cfg.subscriptionEndpoint,
    )

    const jetStream = new JetStreamSubscription(
      db.get(),
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
      cfg: cfg,
      handleResolver: handleResolver,
      didResolver: didResolver,
      storage: storage,
      bq: bq,
      db: db.get(),
      cacheDb: cacheDb,
      uploader: uploader,
    }

    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))
    app.use(express.json())
    app.use(collection(ctx))
    app.use(feed(ctx))
    app.use(waitList(ctx))
    app.use(log(ctx))

    return new FeedGenerator(app, db, firehose, jetStream, cfg)
  }

  async start(): Promise<http.Server> {
    await this.db.migrateToLatest()
    if (this.cfg.firehoseEnabled) {
      // this.firehose.run(this.cfg.subscriptionReconnectDelay)
      this.jetStream.run()
    }

    if (this.cfg.firehoseEnabled && this.cfg.localFirehose) {
      new CronJob(
        '0 */2 * * * *',
        () => {
          if (this.jetStream.isDelayed()) {
            console.warn(`🚨 Firehose flush delayed on: ${this.cfg.port}`)
            this.server?.close((err) => {
              console.log('server closed')
              process.exit(err ? 1 : 0)
            })
          }
        },
        null,
        true,
        'UTC',
      )

      console.log('firehose monitor enabled')
    }

    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
