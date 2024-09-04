import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { BigQuery } from '@google-cloud/bigquery'
import { Post } from './db/schema'
import path from 'path'

const bigquery = new BigQuery({
  projectId: 'robinfeed',
  keyFilename: path.resolve(__dirname, './key.json'),
})

let buffer: Post[] = []

export class FirehoseSubscription extends FirehoseSubscriptionBase {
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
      buffer = buffer.concat(postsToCreate)
      if (buffer.length >= 2500) {
        bigquery
          .dataset('Bluesky')
          .table('Firehose')
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
    }
  }
}
