import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { ExecutorContext } from './types'

export const buildQuery = (ctx: ExecutorContext, params: QueryParams) => {
  let query = `SELECT "uri", "text", "indexedAt", "createdAt" FROM "post" WHERE "rowid" > 0`,
    log = query

  const authors: string[] = [],
    values: string[] = [],
    parameters: string[] = []

  if (Array.isArray(ctx.definition.authors)) {
    ctx.definition.authors.forEach((e) => authors.push(`"${e}"`))
  }

  if (Array.isArray(ctx.definition.hashtags)) {
    ctx.definition.hashtags.forEach((e) => values.push(`"${e}"`))
  }

  if (Array.isArray(ctx.definition.mentions)) {
    ctx.definition.mentions.forEach((e) => values.push(`"${e}"`))
  }

  if (Array.isArray(ctx.definition.search)) {
    ctx.definition.search.forEach((e) => values.push(`"${e}"`))
  }

  const finalizer = async (start: [number, number], errorMessage: string) => {
    const diff = process.hrtime(start)
    const duration = diff[0] * 1e3 + diff[1] * 1e-6

    try {
      const timestamp = new Date()
      await ctx.app.db
        .insertInto('query_log')
        .values({
          feedIdentifier: ctx.identifier,
          userDid: ctx.identity.did,
          userHandle: ctx.identity.handle,
          target: 'Cache',
          query: queryLog,
          duration: duration,
          successful: errorMessage ? 0 : 1,
          errorMessage: errorMessage,
          timestamp: timestamp.getTime(),
          createdAt: timestamp.toISOString(),
        })
        .execute()
    } catch (err) {
      console.error('query log failed', err)
    }
  }

  if (authors.length === 0 && values.length === 0) {
    return {
      query: `SELECT "uri", "text", "indexedAt", "createdAt" FROM "post" WHERE FALSE;`,
      parameters: [],
      finalize: finalizer,
    }
  }

  const AND = ' ',
    OR = ' OR '

  let operator = OR
  if (ctx.definition.operator === 'AND') {
    operator = AND
  }

  if (authors.length) {
    const parameter = authors.join(OR)
    query += ` AND "author" MATCH ?`
    log += ` AND "author" MATCH '${parameter}'`
    parameters.push(parameter)
  }

  if (values.length) {
    const parameter = values.join(operator)
    query += ` AND "text" MATCH ?`
    log += ` AND "text" MATCH '${parameter}'`
    parameters.push(parameter)
  }

  let ordering = ` ORDER BY "rowid" DESC`
  query += ordering + ` LIMIT ${ctx.app.cfg.cacheDiggingDepth};`
  log += ordering + ` LIMIT ${params.limit ?? ctx.app.cfg.cacheDiggingDepth};`

  const queryLog = log
  log = `# ${ctx.identity.did}\n# ${ctx.identity.handle}\n# ${ctx.identifier}\n\n# ${log}`

  console.debug(log)

  return {
    query: query,
    parameters: parameters,
    finalize: finalizer,
  }
}
