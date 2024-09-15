import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { Definition } from './types'

export const SQLiteExecutor = async (
  ctx: AppContext,
  params: QueryParams,
  identifier: string,
  definition: Definition,
  authors: string[],
) => {
  let builder = ctx.db.selectFrom('post').selectAll()

  if (authors.length > 0) {
    builder = builder.where('author', 'in', authors)
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      builder = builder.where('text', 'like', `%${hashtag}%`)
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      builder = builder.where('text', 'like', `%${mention}%`)
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
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
