import { ExecutorContext, Epoch } from './types'

export const refreshCache = async (
  ctx: ExecutorContext,
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
    await ctx.app.db
      .insertInto('cache')
      .values({
        identifier: ctx.identifier,
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
    await ctx.app.db
      .insertInto('cache')
      .values({
        identifier: ctx.identifier,
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

  InProcCache[ctx.identifier] = {
    content: result,
    refreshedAt: local ? Epoch : new Date().toISOString(),
  }

  console.timeEnd('-> REFRESH')

  return result
}

type CacheContent = {
  uri: string
  indexedAt: string
}

type CacheItem = {
  content: CacheContent[]
  refreshedAt: string
}

export const InProcCache: Record<string, CacheItem> = {}
