import { QueryParams } from '../../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { ExecutorContext } from '../types'

export const SQLiteExecutor = async (
  ctx: ExecutorContext,
  params: QueryParams,
) => {
  let builder = ctx.app.db.selectFrom('post').selectAll()

  if (
    Array.isArray(ctx.definition.authors) &&
    ctx.definition.authors.length > 0
  ) {
    builder = builder.where('author', 'in', ctx.definition.authors)
  }

  if (Array.isArray(ctx.definition.hashtags)) {
    ctx.definition.hashtags.forEach((hashtag) => {
      builder = builder.where('text', 'like', `%${hashtag}%`)
    })
  }

  if (Array.isArray(ctx.definition.mentions)) {
    ctx.definition.mentions.forEach((mention) => {
      builder = builder.where('text', 'like', `%${mention}%`)
    })
  }

  if (Array.isArray(ctx.definition.search)) {
    ctx.definition.search.forEach((criteria) => {
      builder = builder.where('text', 'like', `%${criteria}%`)
    })
  }

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
