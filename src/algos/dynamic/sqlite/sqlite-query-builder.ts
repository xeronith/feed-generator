import { QueryParams } from '../../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { ExecutorContext } from '../types'

export const buildQuery = (ctx: ExecutorContext, params: QueryParams) => {
  let query = `SELECT "uri", "indexedAt", "createdAt" FROM "post" WHERE "rowid" > 0`,
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
  ordering += ` LIMIT ${params.limit ?? 100};`

  query += ordering
  log += ordering

  log = `# ${ctx.identity.did}\n# ${ctx.identity.handle}\n# ${ctx.identifier}\n\n# ${log}`

  return {
    query,
    parameters,
    log,
  }
}
