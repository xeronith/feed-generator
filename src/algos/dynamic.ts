import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

// max 15 chars
export const shortname = 'dynamic'

export const handler = async (ctx: AppContext, params: QueryParams) => {
  const identifier = params[shortname]

  const record = await ctx.db
    .selectFrom('feed')
    .selectAll()
    .where('identifier', '=', identifier)
    .executeTakeFirst()

  let authors: string[] = []
  let tags: string[] = []

  if (record) {
    const payload = JSON.parse(record.definition)

    if (payload.handles) {
      const promises = payload.handles.map(async (handle: string) => {
        const author = await ctx.handleResolver.resolve(handle)
        if (author) {
          return author
        }

        return null
      })

      const resolvedPromises = await Promise.all(promises)
      resolvedPromises.forEach((author) => {
        if (author) {
          authors.push(author)
        }
      })
    }

    if (payload.tags) {
      tags = payload.tags
    }
  }

  let builder = ctx.db.selectFrom('post').selectAll()

  if (authors.length == 0 && tags.length == 0) {
    builder = builder.where('author', '=', 'unknown')
  }

  if (authors.length > 0) {
    builder = builder.where('author', 'in', authors)
  }

  tags.forEach((tag) => {
    builder = builder.where('content', 'like', `%${tag}%`)
  })

  builder = builder
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
  }
  const res = await builder.execute()

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return {
    cursor,
    feed,
  }
}
