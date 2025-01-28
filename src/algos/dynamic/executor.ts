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
        console.time('-> QUERY')

        const stmt = connection.prepare(realtimeQueryBuilder.query)
        const realtimeResult = stmt.all(realtimeQueryBuilder.parameters)

        console.timeEnd('-> QUERY')

        cachedResult = realtimeResult.concat(cachedResult)

        console.time('-> SORT')

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

        console.timeEnd('-> SORT')

        console.time('-> EXACT')

        const exacts: string[] = []
        if (Array.isArray(ctx.definition.mentions)) {
          ctx.definition.mentions.forEach((e) => exacts.push(e.toUpperCase()))
        }

        if (Array.isArray(ctx.definition.hashtags)) {
          ctx.definition.hashtags.forEach((e) => exacts.push(e.toUpperCase()))
        }

        if (exacts.length > 0) {
          if (!ctx.definition.advanced || ctx.definition.operator === 'AND')
            cachedResult = cachedResult.filter((row) => {
              for (let i = 0; i < exacts.length; i++) {
                if (
                  row.text.toUpperCase().indexOf(exacts[i] + ' ') >= 0 ||
                  row.text.toUpperCase().indexOf(exacts[i] + '\t') >= 0 ||
                  row.text.toUpperCase().indexOf(exacts[i] + '\n') >= 0 ||
                  row.text.toUpperCase().indexOf(exacts[i] + '\r\n') >= 0 ||
                  row.text.toUpperCase().indexOf(exacts[i]) ===
                    row.text.toUpperCase().length - exacts[i].length
                ) {
                  return true
                }
              }

              return false
            })
        }

        const excludeSearch: string[] = []
        if (Array.isArray(ctx.definition.excludeSearch)) {
          ctx.definition.excludeSearch.forEach((e) =>
            excludeSearch.push(e.toUpperCase()),
          )
        }

        if (excludeSearch.length > 0) {
          cachedResult = cachedResult.filter((row) => {
            for (let i = 0; i < excludeSearch.length; i++) {
              if (row.text.toUpperCase().indexOf(excludeSearch[i]) >= 0) {
                return false
              }
            }

            return true
          })
        }

        const excludeExacts: string[] = []
        if (Array.isArray(ctx.definition.excludeMentions)) {
          ctx.definition.excludeMentions.forEach((e) =>
            excludeExacts.push(e.toUpperCase()),
          )
        }

        if (Array.isArray(ctx.definition.excludeHashtags)) {
          ctx.definition.excludeHashtags.forEach((e) =>
            excludeExacts.push(e.toUpperCase()),
          )
        }

        if (excludeExacts.length > 0) {
          cachedResult = cachedResult.filter((row) => {
            for (let i = 0; i < excludeExacts.length; i++) {
              if (
                row.text.toUpperCase().indexOf(excludeExacts[i] + ' ') >= 0 ||
                row.text.toUpperCase().indexOf(excludeExacts[i] + '\t') >= 0 ||
                row.text.toUpperCase().indexOf(excludeExacts[i] + '\n') >= 0 ||
                row.text.toUpperCase().indexOf(excludeExacts[i] + '\r\n') >=
                  0 ||
                row.text.toUpperCase().indexOf(excludeExacts[i]) ===
                  row.text.toUpperCase().length - excludeExacts[i].length
              ) {
                return false
              }
            }

            return true
          })
        }

        if (Array.isArray(ctx.definition.excludeAuthors)) {
          const excludeAuthors = {}
          ctx.definition.excludeAuthors.forEach((author) => {
            excludeAuthors[author] = true
          })

          cachedResult = cachedResult.filter(
            (row) => !excludeAuthors[row.author],
          )
        }

        if (Array.isArray(ctx.definition.excludeAtUris)) {
          const excludeAtUris = {}
          ctx.definition.excludeAtUris.forEach((excludedAtUri) => {
            excludeAtUris[excludedAtUri] = true
          })

          cachedResult = cachedResult.filter((row) => !excludeAtUris[row.uri])
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

  if (Array.isArray(ctx.definition.atUris)) {
    ctx.definition.atUris.forEach((uri) => {
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
