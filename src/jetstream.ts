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

  public run(subscriptionReconnectDelay: number) {
    const jetStream = new WebSocket(
      `${this.cfg.jetStreamEndpoint}/subscribe?wantedCollections=app.bsky.feed.post`,
    )

    jetStream.on('open', () => {
      console.log('jet stream connected')
    })

    jetStream.on('message', (data: WebSocket.Data) => {
      const message = JSON.parse(data.toString())
      this.handleEvent(message)
    })

    jetStream.on('error', (error: Error) => {
      console.error('jet stream error:', error.message)
    })

    jetStream.on('close', () => {
      console.log('jet stream disconnected')
    })
  }

  async handleEvent(message: any) {
    let posts: any[] = []
    if (Array.isArray(message)) {
      posts = posts.concat(message)
    } else {
      posts.push(message)
    }

    const postsToCreate: Post[] = []
    posts.forEach((post) => {
      if (post.kind !== 'commit' || post.commit?.operation !== 'create') {
        return
      }

      const { did: author, commit } = post ?? {}
      const { record, cid, rkey } = commit ?? {}
      const { text, createdAt } = record ?? {}

      if (!author || !createdAt || !cid || !rkey) {
        console.error('invalid post', post)
        return
      }

      postsToCreate.push({
        cid: cid,
        text: text,
        author: author,
        createdAt: createdAt,
        indexedAt: new Date().toISOString(),
        uri: `at://${author}/app.bsky.feed.post/${rkey}`,
        content: JSON.stringify(post),
      })
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
