import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { BigQuery, BigQueryOptions } from '@google-cloud/bigquery'
import { Post } from './db/schema'
import { Config } from './config'
import { Database } from './db'
import { CacheDatabase } from './db/cache'
import { Telegram } from './util/telegram'
import path from 'path'

let buffer: Post[] = []

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  protected bigquery: BigQuery
  private lastLocalFlush: number
  private bufferFlushFailCount: number = 0
  private bufferFlushFailureBackoff: number = 10

  constructor(
    public db: Database,
    public cacheDb: CacheDatabase,
    public cfg: Config,
  ) {
    super(db, cfg.subscriptionEndpoint)

    const opts: BigQueryOptions = {
      projectId: cfg.bigQueryProjectId,
    }

    if (cfg.bigQueryKeyFile !== 'implicit') {
      opts.keyFilename = path.resolve(__dirname, cfg.bigQueryKeyFile)
    }

    this.bigquery = new BigQuery(opts)
    this.lastLocalFlush = new Date().getTime()
  }

  public isDelayed() {
    return (
      this.lastLocalFlush > 0 &&
      new Date().getTime() - this.lastLocalFlush > 30 * 1000
    )
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const postsToCreate = ops.posts.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        text: create.record.text,
        author: create.author,
        indexedAt: new Date().toISOString(),
        createdAt: create.record.createdAt,
        content: JSON.stringify(create),
      }
    })

    if (postsToCreate.length > 0) {
      buffer = buffer.concat(postsToCreate)

      if (this.cfg.localFirehose) {
        if (buffer.length >= 500) {
          console.debug('repo subscription local flush attempt')

          const data = [...buffer]
          buffer.length = 0

          this.cacheDb
            .write((connection) => {
              const stmt = connection.prepare(
                'INSERT INTO "post" ("uri", "author", "text", "indexedAt", "createdAt") VALUES (?, ?, ?, ?, ?)',
              )

              const transaction = connection.transaction((rows) => {
                for (const row of rows) {
                  stmt.run(
                    row.uri,
                    row.author,
                    row.text,
                    row.indexedAt,
                    row.createdAt,
                  )
                }
              })

              transaction(data)
            })
            .then(() => {
              this.lastLocalFlush = new Date().getTime()
              console.log('repo subscription local flush:', data.length)
            })
            .catch((err) => {
              console.error(
                'repo subscription could not flush local buffer',
                err.message,
              )
            })
        }
      } else {
        const realtimeBuffer = buffer.map((e) => ({
          uri: e.uri,
          author: e.author,
          text: e.text,
          indexedAt: e.indexedAt,
          createdAt: e.createdAt,
        }))

        if (buffer.length >= 2500) {
          this.bigquery
            .dataset(this.cfg.bigQueryDatasetId)
            .table(this.cfg.bigQueryTableId)
            .insert(buffer)
            .catch((err) => {
              console.error(
                'repo subscription could not flush buffer',
                err.message,
              )

              this.bufferFlushFailCount++
              if (this.bufferFlushFailCount > this.bufferFlushFailureBackoff) {
                const message = `🚨 Buffer flush failed: ${err.message}`
                console.error(message)
                Telegram.send(message)

                this.bufferFlushFailureBackoff *= 4
                this.bufferFlushFailCount = 0
              }
            })

          if (this.cfg.bigQueryRealtimeEnabled) {
            this.bigquery
              .dataset(this.cfg.bigQueryDatasetId)
              .table(`${this.cfg.bigQueryRealtimeTableId}`)
              .insert(realtimeBuffer)
              .catch((err) => {
                console.error(
                  'repo subscription could not flush realtime buffer',
                  err.message,
                )
              })
          }

          console.log('repo subscription flush attempted')
          buffer.length = 0
        }
      }
    }
  }
}
