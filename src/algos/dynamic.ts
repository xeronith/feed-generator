import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { BigQuery } from '@google-cloud/bigquery'
import { AppContext } from '../config'
import path from 'path'

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
  let hashtags: string[] = []
  let mentions: string[] = []
  let search: string[] = []

  if (record) {
    const payload = JSON.parse(record.definition)

    if (payload.users) {
      const promises = payload.users.map(async (user: string) => {
        const author = await ctx.handleResolver.resolve(user)
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

    if (payload.hashtags) {
      hashtags = payload.hashtags
    }

    if (payload.mentions) {
      mentions = payload.mentions
    }

    if (payload.search) {
      search = payload.search
    }
  }

  if (ctx.cfg.bigQueryEnabled) {
    const cacheTimeout = new Date(
      new Date().getTime() - ctx.cfg.cacheTimeout,
    ).toISOString()

    let cache = await ctx.db
      .selectFrom('cache')
      .selectAll()
      .where('identifier', '=', identifier)
      .where('refreshedAt', '>', cacheTimeout)
      .executeTakeFirst()

    if (!cache) {
      let query = `SELECT \`uri\`, \`indexedAt\` FROM \`${ctx.cfg.bigQueryDatasetId}.${ctx.cfg.bigQueryTableId}\` WHERE`

      query +=
        ' `indexedAt` > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)'

      if (params.cursor) {
        const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
        query += ` AND \`indexedAt\` < '${timeStr}'`
      }

      const parameters: any[] = []

      if (
        authors.length === 0 &&
        hashtags.length === 0 &&
        mentions.length === 0 &&
        search.length === 0
      ) {
        query += ` AND \`author\` = 'UNKNOWN'`
      } else {
        if (authors.length > 0) {
          authors.forEach((author) => parameters.push(author))
          const authorList = authors.map(() => '?').join(', ')
          query += ` AND \`author\` IN (${authorList})`
        }

        hashtags.forEach((hashtag) => {
          parameters.push(hashtag.replace('-', ' '))
          query += ` AND SEARCH(\`text\`, ?)`
        })

        mentions.forEach((mention) => {
          parameters.push(mention.replace('-', ' '))
          query += ` AND SEARCH(\`text\`, ?)`
        })

        search.forEach((criteria) => {
          parameters.push(criteria.replace('-', ' '))
          query += ` AND SEARCH(\`text\`, ?)`
        })
      }

      query += ` ORDER BY \`indexedAt\` DESC, \`uri\` DESC;`

      const [res] = await new BigQuery({
        projectId: ctx.cfg.bigQueryProjectId,
        keyFilename: path.resolve(__dirname, '..', ctx.cfg.bigQueryKeyFile),
      }).query({
        query: query,
        params: parameters,
      })

      ctx.db
        .insertInto('cache')
        .values({
          identifier: identifier,
          content: JSON.stringify(res),
          refreshedAt: new Date().toISOString(),
        })
        .onConflict((e) =>
          e.doUpdateSet({
            content: JSON.stringify(res),
            refreshedAt: new Date().toISOString(),
          }),
        )
        .execute()

      cache = await ctx.db
        .selectFrom('cache')
        .selectAll()
        .where('identifier', '=', identifier)
        .executeTakeFirst()
    }

    let result: any[] = JSON.parse(cache ? cache.content : '[]')
    if (params.cursor) {
      const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
      result = result.filter((row) => row.indexedAt < timeStr)
    }

    result = result.slice(0, params.limit)

    const feed = result.map((row) => ({
      post: row.uri,
    }))

    let cursor: string | undefined
    const last = result.at(-1)
    if (last) {
      cursor = new Date(last.indexedAt.value).getTime().toString(10)
    }

    return {
      cursor,
      feed,
    }
  } else {
    let builder = ctx.db.selectFrom('post').selectAll()

    if (
      authors.length === 0 &&
      hashtags.length === 0 &&
      mentions.length === 0 &&
      search.length === 0
    ) {
      builder = builder.where('author', '=', 'unknown')
    }

    if (authors.length > 0) {
      builder = builder.where('author', 'in', authors)
    }

    hashtags.forEach((hashtag) => {
      builder = builder.where('text', 'like', `%${hashtag}%`)
    })

    mentions.forEach((mention) => {
      builder = builder.where('text', 'like', `%${mention}%`)
    })

    search.forEach((criteria) => {
      builder = builder.where('text', 'like', `%${criteria}%`)
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
}
