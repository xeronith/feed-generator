import { QueryParams } from '../../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { ExecutorContext } from '../types'
import { buildQuery } from '../sqlite/sqlite-query-builder'
import { timeMachine } from '../time-machine'
import { InProcCache, refreshCache } from '../cache'

export const BigQueryExecutor = async (
  ctx: ExecutorContext,
  params: QueryParams,
) => {
  console.time('-> EXEC')

  let cachedResult: any[] = InProcCache[ctx.identifier]?.content ?? []
  if (ctx.app.cfg.localFirehose) {
    const realtimeQueryBuilder = buildQuery(ctx, params)

    console.time('-> LRT')

    await ctx.app.cacheDb.read((connection) => {
      const start = process.hrtime()

      let errorMessage: string = ''
      try {
        const stmt = connection.prepare(realtimeQueryBuilder.query)
        const realtimeResult = stmt.all(realtimeQueryBuilder.parameters)

        cachedResult = realtimeResult.concat(cachedResult)
        cachedResult = refreshCache(ctx, cachedResult, true)
      } catch (err) {
        errorMessage = err.message
        throw err
      } finally {
        realtimeQueryBuilder.finalize(start, errorMessage)
      }
    })

    console.timeEnd('-> LRT')
  }

  console.time('-> CURSOR')

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    cachedResult = cachedResult.filter((row) => {
      return row.createdAt < timeStr
    })
  }

  if (cachedResult.length < params.limit) {
    cachedResult = await timeMachine(ctx, params)
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
