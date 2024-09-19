import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { BigQuery, BigQueryOptions } from '@google-cloud/bigquery'
import { Post } from './db/schema'
import { Config } from './config'
import { Database } from './db'
import path from 'path'
import Cache from './db/cache'

let buffer: Post[] = []

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  protected bigquery: BigQuery

  constructor(public db: Database, public cfg: Config, public service: string) {
    super(db, service)

    const opts: BigQueryOptions = {
      projectId: cfg.bigQueryProjectId,
    }

    if (cfg.bigQueryKeyFile !== 'implicit') {
      opts.keyFilename = path.resolve(__dirname, cfg.bigQueryKeyFile)
    }

    this.bigquery = new BigQuery(opts)
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // for (const post of ops.posts.creates) {
    //   console.log(post)
    // }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        return true
      })
      .map((create) => {
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

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }

    if (postsToCreate.length > 0) {
      buffer = buffer.concat(postsToCreate)

      if (this.cfg.localFirehose) {
        if (buffer.length >= 250) {
          await Cache.write((connection) => {
            const stmt = connection.prepare(
              'INSERT INTO "post" ("uri", "author", "text", "indexedAt", "createdAt") VALUES (?, ?, ?, ?, ?)',
            )

            const transaction = connection.transaction((rows) => {
              for (const row of rows) {
                stmt.run(row.uri, row.author, row.text, row.indexedAt, row.createdAt)
              }
            })

            transaction(buffer)
          })

          console.log('repo subscription local flush')
          buffer.length = 0
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
