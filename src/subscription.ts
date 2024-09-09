import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { BigQuery } from '@google-cloud/bigquery'
import { Post } from './db/schema'
import { Config } from './config'
import { Database } from './db'
import path from 'path'

let buffer: Post[] = []

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  protected bigquery: BigQuery

  constructor(public db: Database, public cfg: Config, public service: string) {
    super(db, service)

    this.bigquery = new BigQuery({
      projectId: cfg.bigQueryProjectId,
      keyFilename: path.resolve(__dirname, cfg.bigQueryKeyFile),
    })
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
      if (this.cfg.bigQueryEnabled) {
        buffer = buffer.concat(postsToCreate)
        if (buffer.length >= 2500) {
          this.bigquery
            .dataset(this.cfg.bigQueryDatasetId)
            .table(this.cfg.bigQueryTableId)
            .insert(buffer)
            .catch((err) => {
              console.error(
                'repo subscription could not flush',
                JSON.stringify(err, null, 4),
              )
            })

          console.log('flush successful')
          buffer.length = 0
        }
      } else {
        await this.db
          .insertInto('post')
          .values(postsToCreate)
          .onConflict((oc) => oc.doNothing())
          .execute()
      }
    }
  }
}
