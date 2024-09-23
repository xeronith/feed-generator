import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { InProcCache, refreshCache } from './cache'
import { buildQuery } from './bigquery/bigquery-query-builder'
import { Epoch, ExecutorContext } from './types'

export const timeMachine = async (
  ctx: ExecutorContext,
  params: QueryParams,
) => {
  const expiration = new Date().getTime() - ctx.app.cfg.cacheTimeout
  const cacheTimeout = new Date(expiration).toISOString()

  let result: any[] = []
  if (InProcCache[ctx.identifier].refreshedAt < cacheTimeout) {
    const cache = await ctx.app.db
      .selectFrom('cache')
      .selectAll()
      .where('identifier', '=', ctx.identifier)
      .where('refreshedAt', '>', cacheTimeout)
      .executeTakeFirst()

    if (!cache || (cache.refreshedAt ?? Epoch) < cacheTimeout) {
      const queryBuilder = buildQuery(ctx, params)

      console.debug(queryBuilder.log)

      console.time('-> BQ')

      const [queryResult] = await ctx.app.bq.query({
        query: queryBuilder.query,
        params: queryBuilder.parameters,
      })

      result = queryResult
      refreshCache(ctx, result, false)

      console.timeEnd('-> BQ')
    } else {
      result = JSON.parse(cache.content)
      InProcCache[ctx.identifier] = {
        content: result,
        refreshedAt: cache.refreshedAt ?? new Date().toISOString(),
      }
    }
  }

  return result
}
