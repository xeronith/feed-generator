import { CronJob } from 'cron'
import SqliteDb from 'better-sqlite3'
import * as path from 'path'
import { GetFolderSizeInBytes } from '../util/fs'
import { Slack } from '../util/slack'

export const createCacheDb = (location: string): SqliteDb.Database => {
  const cacheLocation = path.join(path.dirname(location), 'cache.db')

  const cache = new SqliteDb(cacheLocation)
  cache.pragma('journal_mode = WAL')

  cache.exec(`CREATE TABLE IF NOT EXISTS "config" ("limit" INTEGER);`)

  cache.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS "post" 
      USING FTS5("uri", "author", "text", "indexedAt");`,
  )

  new CronJob(
    '0 0 0 * * *',
    () => {
      try {
        cache.exec(
          `DELETE FROM "post" WHERE
            "indexedAt" < DATETIME('now', '-7 day')`,
        )
        console.debug('cache cleanup')
      } catch (error) {
        console.error('could not clean cache', error)
      }
    },
    null,
    true,
    'UTC',
  )

  new CronJob(
    '0 */10 * * * *',
    async () => {
      try {
        const config: any = cache.prepare('SELECT "limit" from "config";').get()
        if (!config) return

        const limit = parseInt(config.limit)
        if (!limit) return

        const size = await GetFolderSizeInBytes(path.dirname(location))
        if (size < limit) return

        const sizeInGb = (size / (1024 * 1024 * 1024)).toFixed(2)
        Slack.send(`🚨 Firehose Cache: ${sizeInGb}GB`)
      } catch (error) {
        console.error('could not calculate cache size', error)
      }
    },
    null,
    true,
    'UTC',
  )

  return cache
}
