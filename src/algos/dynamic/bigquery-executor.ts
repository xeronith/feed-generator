import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { BigQuery } from '@google-cloud/bigquery'
import { AppContext } from '../../config'
import { Identity } from '..'
import { Definition } from './types'
import { InProcCache } from './inproc-cache'
import Cache from '../../db/cache'
import path from 'path'

const Epoch = '1970-01-01T00:00:00.000Z'

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

  let cachedResult: any[] = InProcCache[identifier]?.content ?? []
  if (ctx.cfg.localRealtimeEnabled && ctx.cfg.localFirehose) {
    const realtimeQueryBuilder = buildLocalQuery(
      identity,
      identifier,
      definition,
      params.limit,
    )

    console.time('-> LRT')

    await Cache.read((connection) => {
      console.debug(realtimeQueryBuilder.log)

      const stmt = connection.prepare(realtimeQueryBuilder.query)
      const realtimeResult = stmt.all(realtimeQueryBuilder.parameters)

      cachedResult = realtimeResult.concat(cachedResult)
      cachedResult = refreshCache(ctx, identifier, cachedResult, true)
    })

    console.timeEnd('-> LRT')
  } else if (ctx.cfg.bigQueryRealtimeEnabled) {
    const realtimeQueryBuilder = buildQuery(
      params,
      ctx.cfg.bigQueryDatasetId,
      ctx.cfg.bigQueryRealtimeTableId,
      `'${InProcCache[identifier].refreshedAt}'`,
      identity,
      identifier,
      definition,
      1000,
    )

    console.debug(realtimeQueryBuilder.log)

    console.time('-> BQRT')

    const [realtimeQueryResult] = await bigquery.query({
      query: realtimeQueryBuilder.query,
      params: realtimeQueryBuilder.parameters,
    })

    console.timeEnd('-> BQRT')

    cachedResult = realtimeQueryResult.concat(cachedResult)

    refreshCache(ctx, identifier, cachedResult, false)
  }

  console.time('-> CURSOR')

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    cachedResult = cachedResult.filter((row) => {
      return row.createdAt < timeStr
    })
  }

  if (cachedResult.length < params.limit) {
    cachedResult = await timeMachine(
      bigquery,
      ctx,
      params,
      identity,
      identifier,
      definition,
    )
  }

  cachedResult = cachedResult.slice(0, params.limit)

  console.timeEnd('-> CURSOR')

  const feed = cachedResult.map((item) => ({
    post: item.uri,
  }))

  let cursor: string | undefined
  const last = cachedResult.at(-1)
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
  local: boolean,
) => {
  console.time('-> REFRESH')

  const seen = new Set<string>()
  result = result
    .filter((item) => {
      if (seen.has(item.uri)) {
        return false
      } else {
        seen.add(item.uri)
        return true
      }
    })
    .slice(0, 10000)

  console.time('-> SERIALIZE')

  const content = JSON.stringify(result ?? [])

  console.timeEnd('-> SERIALIZE')

  console.time('-> PUT')

  if (local) {
    ctx.db
      .insertInto('cache')
      .values({
        identifier: identifier,
        content: content,
        refreshedAt: Epoch,
      })
      .onConflict((e) =>
        e.doUpdateSet({
          content: content,
        }),
      )
      .execute()
  } else {
    ctx.db
      .insertInto('cache')
      .values({
        identifier: identifier,
        content: content,
        refreshedAt: new Date().toISOString(),
      })
      .onConflict((e) =>
        e.doUpdateSet({
          content: content,
          refreshedAt: new Date().toISOString(),
        }),
      )
      .execute()
  }

  console.timeEnd('-> PUT')

  InProcCache[identifier] = {
    content: result,
    refreshedAt: local ? Epoch : new Date().toISOString(),
  }

  console.timeEnd('-> REFRESH')

  return result
}

const timeMachine = async (
  bigquery: BigQuery,
  ctx: AppContext,
  params: QueryParams,
  identity: Identity,
  identifier: string,
  definition: Definition,
) => {
  const cacheTimeout = new Date(
    new Date().getTime() - ctx.cfg.cacheTimeout,
  ).toISOString()

  if (InProcCache[identifier].refreshedAt < cacheTimeout) {
    const cache = await ctx.db
      .selectFrom('cache')
      .selectAll()
      .where('identifier', '=', identifier)
      .where('refreshedAt', '>', cacheTimeout)
      .executeTakeFirst()

    if (!cache || (cache.refreshedAt ?? Epoch) < cacheTimeout) {
      let interval = `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ctx.cfg.maxInterval} DAY)`
      if (params.cursor) {
        const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
        interval = `TIMESTAMP_SUB('${timeStr}', INTERVAL ${ctx.cfg.maxInterval} DAY)`
      }

      const queryBuilder = buildQuery(
        params,
        ctx.cfg.bigQueryDatasetId,
        ctx.cfg.bigQueryTableId,
        interval,
        identity,
        identifier,
        definition,
        10000,
      )

      console.debug(queryBuilder.log)

      console.time('-> BQ')

      const [queryResult] = await bigquery.query({
        query: queryBuilder.query,
        params: queryBuilder.parameters,
      })

      refreshCache(ctx, identifier, queryResult, false)

      console.timeEnd('-> BQ')
    } else {
      InProcCache[identifier] = {
        content: JSON.parse(cache.content),
        refreshedAt: cache.refreshedAt ?? new Date().toISOString(),
      }
    }
  }

  return InProcCache[identifier].content
}

const buildLocalQuery = (
  identity: Identity,
  identifier: string,
  definition: Definition,
  limit: number,
) => {
  let query = `SELECT "uri", "indexedAt", "createdAt" FROM "post" WHERE "rowid" > 0`,
    log = query

  const authors: string[] = [],
    values: string[] = [],
    parameters: string[] = []

  if (Array.isArray(definition.authors)) {
    definition.authors.forEach((e) => authors.push(`"${e}"`))
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((e) => values.push(`"${e}"`))
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((e) => values.push(`"${e}"`))
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((e) => values.push(`"${e}"`))
  }

  if (authors.length) {
    query += ` AND "author" MATCH ?`
    log += ` AND "author" MATCH '${authors.join(' OR ')}'`
    parameters.push(authors.join(' OR '))
  }

  if (values.length) {
    query += ` AND "text" MATCH ?`
    log += ` AND "text" MATCH '${values.join(' ')}'`
    parameters.push(values.join(' '))
  }

  let ordering = ` ORDER BY "rowid" DESC`
  ordering += ` LIMIT ${limit ?? 100};`

  query += ordering
  log += ordering

  log = `# ${identity.did}\n# ${identity.handle}\n# ${identifier}\n\n# ${log}`

  return {
    query,
    parameters,
    log,
  }
}

const buildQuery = (
  params: QueryParams,
  datasetId: string,
  tableId: string,
  interval: string,
  identity: Identity,
  identifier: string,
  definition: Definition,
  limit: number,
) => {
  let query = `SELECT \`uri\`, \`indexedAt\`, \`createdAt\` FROM \`${datasetId}.${tableId}\` WHERE \`indexedAt\` > ${interval}`
  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    query += ` AND \`indexedAt\` < '${timeStr}'`
  }

  let log = query

  const authors: string[] = [],
    authorsLog: string[] = [],
    authorsParam: string[] = [],
    values: string[] = []

  if (Array.isArray(definition.authors)) {
    definition.authors.forEach((e) => {
      authorsParam.push(`"${e}"`)
      authors.push('SEARCH(`author`, ?)')
      authorsLog.push(`SEARCH(\`author\`, '"${e}"')`)
    })
  }

  if (Array.isArray(definition.hashtags)) {
    definition.hashtags.forEach((e) => values.push(`"${e}"`))
  }

  if (Array.isArray(definition.mentions)) {
    definition.mentions.forEach((e) => values.push(`"${e}"`))
  }

  if (Array.isArray(definition.search)) {
    definition.search.forEach((e) => values.push(`"${e}"`))
  }

  if (authors.length) {
    query += ` AND (${authors.join(' OR ')})`
    log += ` AND (${authorsLog.join(' OR ')})`
  }

  if (values.length) {
    query += ` AND SEARCH(\`text\`, ?)`
    log += ` AND SEARCH(\`text\`, '${values.join(' ')}')`
  }

  let ordering = ` ORDER BY \`indexedAt\` DESC`
  ordering += ` LIMIT ${limit ?? 100};`

  query += ordering
  log += ordering

  log = `# ${identity.did}\n# ${identity.handle}\n# ${identifier}\n\n# ${log}`
  query = `${log}\n\n${query}`

  return {
    query: query,
    parameters: authorsParam.concat([values.join(' ')]),
    log: log,
  }
}
