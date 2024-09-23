import { QueryParams } from '../../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { ExecutorContext } from '../types'

export const buildQuery = (ctx: ExecutorContext, params: QueryParams) => {
  let interval = `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${ctx.app.cfg.maxInterval} DAY)`
  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    interval = `TIMESTAMP_SUB('${timeStr}', INTERVAL ${ctx.app.cfg.maxInterval} DAY)`
  }

  let query = `SELECT \`uri\`, \`indexedAt\`, \`createdAt\` FROM \`${ctx.app.cfg.bigQueryDatasetId}.${ctx.app.cfg.bigQueryTableId}\` WHERE \`indexedAt\` > ${interval}`
  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    query += ` AND \`indexedAt\` < '${timeStr}'`
  }

  let log = query

  const authors: string[] = [],
    authorsLog: string[] = [],
    authorsParam: string[] = [],
    values: string[] = []

  if (Array.isArray(ctx.definition.authors)) {
    ctx.definition.authors.forEach((e) => {
      authorsParam.push(`"${e}"`)
      authors.push('SEARCH(`author`, ?)')
      authorsLog.push(`SEARCH(\`author\`, '"${e}"')`)
    })
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
    query += ` AND (${authors.join(' OR ')})`
    log += ` AND (${authorsLog.join(' OR ')})`
  }

  if (values.length) {
    query += ` AND SEARCH(\`text\`, ?)`
    log += ` AND SEARCH(\`text\`, '${values.join(' ')}')`
  }

  let ordering = ` ORDER BY \`indexedAt\` DESC`
  ordering += ` LIMIT 10000;`

  query += ordering
  log += ordering

  const queryLog = log
  log = `# ${ctx.identity.did}\n# ${ctx.identity.handle}\n# ${ctx.identifier}\n\n# ${log}`
  query = `${log}\n\n${query}`

  console.debug(log)

  return {
    query: query,
    parameters: authorsParam.concat([values.join(' ')]),
    finalize: async (start: [number, number], errorMessage: string) => {
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
            target: 'BigQuery',
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
    },
  }
}
