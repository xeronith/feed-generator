import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { BigQuery } from '@google-cloud/bigquery'
import { AppContext } from '../../config'
import { Identity } from '..'
import { Definition } from './types'
import { InProcCache } from './inproc-cache'
import * as LZString from 'lz-string'
import Cache from '../../db/cache'
import path from 'path'

export const BigQueryExecutor = async (
  ctx: AppContext,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
) => {
  console.time('-> EXEC')

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

      console.debug(queryBuilder.comment)

      console.time('-> BQ')

      const [queryResult] = await bigquery.query({
        query: queryBuilder.query,
        params: queryBuilder.parameters,
      })

      console.timeEnd('-> BQ')

      refreshCache(ctx, identifier, queryResult)

      cache = await ctx.db
        .selectFrom('cache')
        .selectAll()
        .where('identifier', '=', identifier)
        .executeTakeFirst()
    }

    InProcCache[identifier] = {
      content: JSON.parse(cache ? cache.content : '[]'),
      refreshedAt: cache?.refreshedAt ?? new Date().toISOString(),
    }
  }

  let result: any[] = InProcCache[identifier].content

  if (ctx.cfg.localRealtimeEnabled && ctx.cfg.localFirehose) {
    const realtimeQueryBuilder = buildLocalQuery(
      `'${InProcCache[identifier].refreshedAt}'`,
      params,
      identity,
      identifier,
      definition,
    )

    console.time('-> CACHE')

    await Cache.read((connection) => {
      console.debug(realtimeQueryBuilder.comment)

      const stmt = connection.prepare(realtimeQueryBuilder.query)
      const realtimeQueryResult = stmt.all(realtimeQueryBuilder.parameters)

      if (realtimeQueryResult.length < 10000) {
        result = realtimeQueryResult.concat(result)
      } else {
        result = realtimeQueryResult
      }
    })

    console.timeEnd('-> CACHE')

    const refreshedCache = refreshCache(ctx, identifier, result)

    InProcCache[identifier] = {
      content: refreshedCache.result,
      refreshedAt: refreshedCache.refreshedAt,
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

    console.debug(realtimeQueryBuilder.comment)

    console.time('-> BQ(R)')

    const [realtimeQueryResult] = await bigquery.query({
      query: realtimeQueryBuilder.query,
      params: realtimeQueryBuilder.parameters,
    })

    console.timeEnd('-> BQ(R)')

    result = realtimeQueryResult.concat(result)

    const refreshedCache = refreshCache(ctx, identifier, result)

    InProcCache[identifier] = {
      content: refreshedCache.result,
      refreshedAt: refreshedCache.refreshedAt,
    }
  }

  console.time('-> CURSOR')

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    result = result.filter((row) => {
      if (row.createdAt) {
        return row.createdAt < timeStr
      }

      return row.indexedAt < timeStr
    })
  }

  result = result.slice(0, params.limit)

  console.timeEnd('-> CURSOR')

  const feed = result.map((item) => ({
    post: item.uri,
  }))

  let cursor: string | undefined
  const last = result.at(-1)
  if (last) {
    if (last.createdAt) {
      cursor = new Date(last.createdAt.value ?? last.createdAt)
        .getTime()
        .toString(10)
    } else {
      cursor = new Date(last.indexedAt.value ?? last.indexedAt)
        .getTime()
        .toString(10)
    }
  }

  console.timeEnd('-> EXEC')

  return {
    cursor,
    feed,
  }
}

const refreshCache = (
  ctx: AppContext,
  identifier: string,
  result: { uri: string; indexedAt: string; createdAt: string }[],
) => {
  console.time('-> REFRESH')

  const seen = new Set<string>()
  result = result.filter((item) => {
    if (seen.has(item.uri)) {
      return false
    } else {
      seen.add(item.uri)
      return true
    }
  })

  const refreshedAt = new Date().toISOString()

  console.time('-> COMPRESS')

  const cacheItem = {
    identifier: identifier,
    content: JSON.stringify(result ?? []),
    refreshedAt: refreshedAt,
  }

  console.timeEnd('-> COMPRESS')

  console.time('-> PUT')

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

  console.timeEnd('-> PUT')

  console.timeEnd('-> REFRESH')

  return { result, refreshedAt }
}

const buildLocalQuery = (
  interval: string,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
) => {
  let query = `SELECT "uri", "indexedAt", "createdAt" FROM "post" WHERE`
  query += ` "rowid" > 0`

  const parameters: any[] = []
  let comment = query

  if (Array.isArray(definition.authors) && definition.authors.length > 0) {
    definition.authors.forEach((author) => parameters.push(author))
    const authorList = definition.authors.map(() => '?').join(', ')
    const authorListRaw = definition.authors
      .map((author) => `'${author}'`)
      .join(', ')

    query += ` AND "author" IN (${authorList})`
    comment += ` AND "author" IN (${authorListRaw})`
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((hashtag) => {
      parameters.push(hashtag.replace('@', '').replace('#', ''))
      query += ` AND "text" MATCH ?`
      comment += ` AND "text" MATCH '${parameters.at(-1)}'`
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      parameters.push(mention.replace('@', '').replace('#', ''))
      query += ` AND "text" MATCH ?`
      comment += ` AND "text" MATCH '${parameters.at(-1)}'`
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      parameters.push(criteria.replace('@', '').replace('#', ''))
      query += ` AND "text" MATCH ?`
      comment += ` AND "text" MATCH '${parameters.at(-1)}'`
    })
  }

  const ordering = ` ORDER BY "rowid" DESC LIMIT 10000;`
  query += ordering
  comment += ordering

  comment = `# ${identity.did}\n# ${identity.handle}\n# ${identifier}\n\n# ${comment}`

  return {
    query,
    parameters,
    comment,
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
  let query = `SELECT \`uri\`, \`indexedAt\`, \`createdAt\` FROM \`${datasetId}.${tableId}\` WHERE`
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
      comment += ` AND SEARCH(\`text\`, '${parameters.at(-1)}')`
    })
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((mention) => {
      parameters.push(mention)
      query += ` AND SEARCH(\`text\`, ?)`
      comment += ` AND SEARCH(\`text\`, '${parameters.at(-1)}')`
    })
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((criteria) => {
      parameters.push(criteria)
      query += ` AND SEARCH(\`text\`, ?)`
      comment += ` AND SEARCH(\`text\`, '${parameters.at(-1)}')`
    })
  }

  const ordering = ` ORDER BY \`indexedAt\` DESC, \`uri\` DESC LIMIT 10000;`
  query += ordering
  comment += ordering

  comment = `# ${identity.did}\n# ${identity.handle}\n# ${identifier}\n\n# ${comment}`
  query = `${comment}\n\n${query}`

  return {
    query,
    parameters,
    comment: comment,
  }
}
