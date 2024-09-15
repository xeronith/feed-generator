import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { SQLiteExecutor } from './sqlite-executor'
import { BigQueryExecutor } from './bigquery-executor'
import { Definition, Executor, Nothing } from './types'

export const shortname = 'dynamic'

export const handler = async (ctx: AppContext, params: QueryParams) => {
  const identifier = params[shortname]

  const record = await ctx.db
    .selectFrom('feed')
    .selectAll()
    .where('identifier', '=', identifier)
    .executeTakeFirst()

  if (!record) {
    return Nothing
  }

  const definition: Definition = JSON.parse(record.definition)

  if (
    definition?.users?.length === 0 &&
    definition?.hashtags?.length === 0 &&
    definition?.mentions?.length === 0 &&
    definition?.search?.length === 0
  ) {
    return Nothing
  }

  const authors: string[] = []
  if (Array.isArray(definition.users)) {
    const promises = definition.users.map(async (user: string) => {
      const author = await ctx.handleResolver.resolve(user)
      if (author) {
        return author
      }

      return null
    })

    const resolvedPromises = await Promise.all(promises)
    resolvedPromises.forEach((author) => {
      if (author) {
        authors.push(author)
      }
    })
  }

  let executor: Executor = SQLiteExecutor
  if (ctx.cfg.bigQueryEnabled) {
    executor = BigQueryExecutor
  }

  return executor(ctx, params, identifier, definition, authors)
}
