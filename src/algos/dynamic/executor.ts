import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { ExecutorContext } from './types'
import { buildQuery } from './sqlite-query-builder'
import { timeMachine } from './time-machine'
import { InProcCache, refreshCache } from './cache'

export const execute = async (ctx: ExecutorContext, params: QueryParams) => {
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

        cachedResult.sort((x, y) => {
          const dateX = new Date(x.createdAt).getTime()
          const dateY = new Date(y.createdAt).getTime()

          const isValidX = !isNaN(dateX)
          const isValidY = !isNaN(dateY)

          if (!isValidX && !isValidY) return 0 // Both invalid, keep original order
          if (!isValidX) return 1 // Move invalid `x` to the end
          if (!isValidY) return -1 // Move invalid `y` to the end

          return dateY - dateX
        })

        console.time('-> EXACT')

        const exacts: string[] = []
        if (Array.isArray(ctx.definition.mentions)) {
          ctx.definition.mentions.forEach((e) => exacts.push(e.toUpperCase()))
        }

        if (Array.isArray(ctx.definition.hashtags)) {
          ctx.definition.hashtags.forEach((e) => exacts.push(e.toUpperCase()))
        }

        if (exacts.length > 0) {
          cachedResult = cachedResult.filter((row) => {
            for (let i = 0; i < exacts.length; i++) {
              if (row.text.toUpperCase().indexOf(exacts[i]) >= 0) {
                return true
              }
            }

            return false
          })
        }

        if (Array.isArray(ctx.definition.blockedAuthors)) {
          const blockedAuthors = {}
          ctx.definition.blockedAuthors.forEach((blockedAuthor) => {
            blockedAuthors[blockedAuthor] = true
          })

          cachedResult = cachedResult.filter(
            (row) => !blockedAuthors[row.author],
          )
        }

        if (Array.isArray(ctx.definition.excludedAtUris)) {
          const excludedAtUris = {}
          ctx.definition.excludedAtUris.forEach((excludedAtUri) => {
            excludedAtUris[excludedAtUri] = true
          })

          cachedResult = cachedResult.filter((row) => !excludedAtUris[row.uri])
        }

        console.timeEnd('-> EXACT')

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

  let timeStr = new Date().toISOString()
  if (params.cursor) {
    timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
  }

  cachedResult = cachedResult.filter((row) => {
    return row.createdAt < timeStr
  })

  if (ctx.app.cfg.bigQueryEnabled && cachedResult.length < params.limit) {
    cachedResult = await timeMachine(ctx, params)
  }

  cachedResult = cachedResult.slice(0, params.limit)

  console.timeEnd('-> CURSOR')

  const feed = cachedResult.map((item) => ({
    post: item.uri,
  }))

  if (Array.isArray(ctx.definition.includedAtUris)) {
    ctx.definition.includedAtUris.forEach((uri) => {
      feed.unshift({ post: uri })
    })
  }

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
