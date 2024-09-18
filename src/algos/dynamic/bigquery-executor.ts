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
) => {
  const bigquery = new BigQuery({
    projectId: ctx.cfg.bigQueryProjectId,
    keyFilename: path.resolve(__dirname, '../..', ctx.cfg.bigQueryKeyFile),
  })

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
      const queryBuilder = buildQuery(
        ctx.cfg.bigQueryDatasetId,
        ctx.cfg.bigQueryTableId,
        `TIMESTAMP_SUB(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL ${ctx.cfg.maxInterval} DAY)`,
        params,
        identity,
        identifier,
        definition,
      )

      const [queryResult] = await bigquery.query({
        query: queryBuilder.query,
        params: queryBuilder.parameters,
      })

      refreshCache(ctx, identifier, queryResult)

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

  if (ctx.cfg.localFirehose) {
    const realtimeQueryBuilder = buildLocalQuery(
      `'${InProcCache[identifier].refreshedAt}'`,
      params,
      identity,
      identifier,
      definition,
    )

    const stmt = ctx.cacheDb.prepare(realtimeQueryBuilder.query)
    const realtimeQueryResult = stmt.all(realtimeQueryBuilder.parameters)

    result = realtimeQueryResult.concat(result)

    const refreshedAt = refreshCache(ctx, identifier, result)

    InProcCache[identifier] = {
      content: result,
      refreshedAt: refreshedAt,
    }
  } else if (ctx.cfg.bigQueryRealtimeEnabled) {
    const realtimeQueryBuilder = buildQuery(
      ctx.cfg.bigQueryDatasetId,
      ctx.cfg.bigQueryRealtimeTableId,
      `'${InProcCache[identifier].refreshedAt}'`,
      params,
      identity,
      identifier,
      definition,
    )

    const [realtimeQueryResult] = await bigquery.query({
      query: realtimeQueryBuilder.query,
      params: realtimeQueryBuilder.parameters,
    })

    result = realtimeQueryResult.concat(result)

    const refreshedAt = refreshCache(ctx, identifier, result)

    InProcCache[identifier] = {
      content: result,
      refreshedAt: refreshedAt,
    }
  }

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
    cursor = new Date(last.indexedAt.value ?? last.indexedAt)
      .getTime()
      .toString(10)
  }

  return {
    cursor,
    feed,
  }
}

const refreshCache = (ctx: AppContext, identifier: string, result: any[]) => {
  const refreshedAt = new Date().toISOString()

  const cacheItem = {
    identifier: identifier,
    content: LZString.compressToUTF16(JSON.stringify(result ?? [])),
    refreshedAt: refreshedAt,
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

  return refreshedAt
}

const buildLocalQuery = (
  interval: string,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
) => {
  let query = `SELECT "uri", "indexedAt" FROM "post" WHERE`
  query += ` "indexedAt" > ${interval}`

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    query += ` AND "indexedAt" < '${timeStr}'`
  }

  const parameters: any[] = []

  if (Array.isArray(definition.authors) && definition.authors.length > 0) {
    definition.authors.forEach((author) => parameters.push(author))
    const authorList = definition.authors.map(() => '?').join(', ')
    const authorListRaw = definition.authors
      .map((author) => `'${author}'`)
      .join(', ')

    query += ` AND "author" IN (${authorList})`
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      parameters.push(hashtag.replace('@', '').replace('#', ''))
      query += ` AND "text" MATCH ?`
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      parameters.push(mention.replace('@', '').replace('#', ''))
      query += ` AND "text" MATCH ?`
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      parameters.push(criteria.replace('@', '').replace('#', ''))
      query += ` AND "text" MATCH ?`
    })
  }

  const ordering = ` ORDER BY "indexedAt" DESC, "uri" DESC LIMIT 10000;`
  query += ordering

  return {
    query,
    parameters,
  }
}

const buildQuery = (
  datasetId: string,
  tableId: string,
  interval: string,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
) => {
  let query = `SELECT \`uri\`, \`indexedAt\` FROM \`${datasetId}.${tableId}\` WHERE`
  query += ` \`indexedAt\` > ${interval}`

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    query += ` AND \`indexedAt\` < '${timeStr}'`
  }

  const parameters: any[] = []
  let comment = query

  if (Array.isArray(definition.authors) && definition.authors.length > 0) {
    definition.authors.forEach((author) => parameters.push(author))
    const authorList = definition.authors.map(() => '?').join(', ')
    const authorListRaw = definition.authors
      .map((author) => `'${author}'`)
      .join(', ')

    query += ` AND \`author\` IN (${authorList})`
    comment += ` AND \`author\` IN (${authorListRaw})`
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      parameters.push(hashtag)
      query += ` AND SEARCH(\`text\`, ?)`
      comment += ` AND SEARCH(\`text\`, '${hashtag}')`
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      parameters.push(mention)
      query += ` AND SEARCH(\`text\`, ?)`
      comment += ` AND SEARCH(\`text\`, '${mention}')`
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      parameters.push(criteria)
      query += ` AND SEARCH(\`text\`, ?)`
      comment += ` AND SEARCH(\`text\`, '${criteria}')`
    })
  }

  const ordering = ` ORDER BY \`indexedAt\` DESC, \`uri\` DESC LIMIT 10000;`
  query += ordering
  comment += ordering

  query = `# ${identity.did}\n# ${identity.handle}\n# ${identifier}\n\n# ${comment}\n\n${query}`

  return {
    query,
    parameters,
  }
}
