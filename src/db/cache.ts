import { CronJob } from 'cron'
import SqliteDb from 'better-sqlite3'
import * as path from 'path'

export const createCacheDb = (location: string): SqliteDb.Database => {
  const cacheLocation = path.join(path.dirname(location), 'cache.db')

  const cache = new SqliteDb(cacheLocation)
  cache.pragma('journal_mode = WAL')

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

  return cache
}
