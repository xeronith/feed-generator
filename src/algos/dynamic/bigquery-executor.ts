import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { BigQuery } from '@google-cloud/bigquery'
import { AppContext } from '../../config'
import { Identity } from '..'
import { Definition } from './types'
import { InProcCache } from './inproc-cache'
import * as LZString from 'lz-string'
import path from 'path'

export const BigQueryExecutor = async (
  ctx: AppContext,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
  authors: string[],
) => {
  const cacheTimeout = new Date(
    new Date().getTime() - ctx.cfg.cacheTimeout,
  ).toISOString()

  if (
    !InProcCache[identifier] ||
    InProcCache[identifier].refreshedAt < cacheTimeout
  ) {
    let cache = await ctx.db
      .selectFrom('cache')
      .selectAll()
      .where('identifier', '=', identifier)
      .where('refreshedAt', '>', cacheTimeout)
      .executeTakeFirst()

    if (!cache) {
      let query = `SELECT \`uri\`, \`indexedAt\` FROM \`${ctx.cfg.bigQueryDatasetId}.${ctx.cfg.bigQueryTableId}\` WHERE`
      query += ` \`indexedAt\` > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ctx.cfg.maxInterval} DAY)`

      if (params.cursor) {
        const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
        query += ` AND \`indexedAt\` < '${timeStr}'`
      }

      const parameters: any[] = []
      let comment = query

      if (authors.length > 0) {
        authors.forEach((author) => parameters.push(author))
        const authorList = authors.map(() => '?').join(', ')
        const authorListRaw = authors.map((author) => `'${author}'`).join(', ')

        query += ` AND \`author\` IN (${authorList})`
        comment += ` AND \`author\` IN (${authorListRaw})`
      }

      if (Array.isArray(definition.hashtags)) {
        definition.hashtags.forEach((hashtag) => {
          parameters.push(hashtag.replace('-', ' '))
          query += ` AND SEARCH(\`text\`, ?)`
          comment += ` AND SEARCH(\`text\`, '${hashtag.replace('-', ' ')}')`
        })
      }

      if (Array.isArray(definition.mentions)) {
        definition.mentions.forEach((mention) => {
          parameters.push(mention.replace('-', ' '))
          query += ` AND SEARCH(\`text\`, ?)`
          comment += ` AND SEARCH(\`text\`, '${mention.replace('-', ' ')}')`
        })
      }

      if (Array.isArray(definition.search)) {
        definition.search.forEach((criteria) => {
          parameters.push(criteria.replace('-', ' '))
          query += ` AND SEARCH(\`text\`, ?)`
          comment += ` AND SEARCH(\`text\`, '${criteria.replace('-', ' ')}')`
        })
      }

      const ordering = ` ORDER BY \`indexedAt\` DESC, \`uri\` DESC;`
      query += ordering
      comment += ordering

      query = `# ${identity.did}\n# ${identity.handle}\n# ${identifier}\n\n# ${comment}\n\n${query}`

      const [queryResult] = await new BigQuery({
        projectId: ctx.cfg.bigQueryProjectId,
        keyFilename: path.resolve(__dirname, '../..', ctx.cfg.bigQueryKeyFile),
      }).query({
        query: query,
        params: parameters,
      })

      const cacheItem = {
        identifier: identifier,
        content: LZString.compressToUTF16(JSON.stringify(queryResult ?? [])),
        refreshedAt: new Date().toISOString(),
      }

      ctx.db
        .insertInto('cache')
        .values(cacheItem)
        .onConflict((e) =>
          e.doUpdateSet({
            content: cacheItem.content,
            refreshedAt: cacheItem.refreshedAt,
          }),
        )
        .execute()

      cache = await ctx.db
        .selectFrom('cache')
        .selectAll()
        .where('identifier', '=', identifier)
        .executeTakeFirst()
    }

    InProcCache[identifier] = {
      content: JSON.parse(
        cache ? LZString.decompressFromUTF16(cache.content) : '[]',
      ),

      refreshedAt: cache?.refreshedAt ?? new Date().toISOString(),
    }
  }

  let result: any[] = InProcCache[identifier].content

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    result = result.filter((row) => row.indexedAt < timeStr)
  }

  result = result.slice(0, params.limit)

  const feed = result.map((item) => ({
    post: item.uri,
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
}
