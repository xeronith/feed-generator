import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { BigQuery, BigQueryOptions } from '@google-cloud/bigquery'
import { Post } from './db/schema'
import { Config } from './config'
import WebSocket from 'ws'
import { Database } from './db'
import { CacheDatabase } from './db/cache'
import path from 'path'

let buffer: Post[] = []

export class JetStreamSubscription {
  protected bigquery: BigQuery
  private lastLocalFlush: number

  constructor(
    public db: Database,
    public cacheDb: CacheDatabase,
    public cfg: Config,
    public service: string,
  ) {
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

  public run() {
    const jetStream = new WebSocket(
      'wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post',
    )

    jetStream.on('open', () => {
      console.log('Connected to the JetStream server')
    })

    jetStream.on('message', (data: WebSocket.Data) => {
      const post = JSON.parse(data.toString())
      this.handleEvent(post)
    })

    jetStream.on('error', (error: Error) => {
      console.error('JetStream error:', error.message)
    })

    jetStream.on('close', () => {
      console.log('Disconnected from the JetStream server')
    })
  }

  async handleEvent(post: any) {
    if (
      !post.kind ||
      post.kind !== 'commit' ||
      !post.commit ||
      !post.commit.operation ||
      post.commit.operation !== 'create'
    ) {
      return
    }

    const author = post?.did
    const text = post?.commit?.record?.text
    const createdAt = post?.commit?.record?.createdAt
    const cid = post?.commit?.cid

    if (!author || !createdAt || !cid) {
      console.error('invalid post', post)
      return
    }

    const uri = `at://${author}/app.bsky.feed.post/${post.commit.rkey}`

    const postsToCreate = [
      {
        uri: uri,
        cid: cid,
        text: text,
        author: author,
        indexedAt: new Date().toISOString(),
        createdAt: createdAt,
        content: JSON.stringify(post),
      },
    ]

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
                JSON.stringify(err, null, 4),
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
                JSON.stringify(err, null, 4),
              )
            })

          if (this.cfg.bigQueryRealtimeEnabled) {
            this.bigquery
              .dataset(this.cfg.bigQueryDatasetId)
              .table(`${this.cfg.bigQueryRealtimeTableId}`)
              .insert(realtimeBuffer)
              .catch((err) => {
                console.error(
                  'repo subscription could not flush realtime buffer',
                  JSON.stringify(err, null, 4),
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
