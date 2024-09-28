import * as path from 'path'
import moment from 'moment'
import { CronJob } from 'cron'
import { GetFolderSizeInBytes } from '../util/fs'
import { Slack } from '../util/slack'
import { Pool, PoolConnection } from 'better-sqlite-pool'
import { Config } from '../config'

export class CacheDatabase {
  private writer: Pool
  private reader: Pool

  constructor(cfg: Config) {
    const location = path.join(path.dirname(cfg.sqliteLocation), 'cache.db')

    this.writer = new Pool(location)

    this.reader = new Pool(location, {
      max: 100,
      readonly: true,
    })

    this.write((connection) => {
      connection.exec(`CREATE TABLE IF NOT EXISTS "config" ("limit" INTEGER) STRICT;`)
      connection.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS "post" 
                            USING FTS5("uri", "author", "text", "indexedAt", "createdAt");`)
    })

    new CronJob(
      `0/${cfg.cacheCleanupInterval} * * * * *`,
      () => {
        this.write((connection) => {
          try {
            const mark = moment()
              .subtract(cfg.maxInterval, 'days')
              .format('YYYY-MM-DDTHH')

            let query = `SELECT "rowid" FROM "post" WHERE "indexedAt" MATCH '"${mark}"' ORDER BY "rowid" DESC LIMIT 1;`
            console.log(`cache check:`, query)
            const result: any = connection.prepare(query).pluck().get()

            if (result) {
              const limit = cfg.cacheCleanupPageSize
              const maxId = result
              const minId = maxId - limit

              query = `DELETE FROM "post" where rowid <= ${maxId} and rowid > ${minId};`
              console.debug('cache cleanup attempt:', query)

              connection.transaction(() => {
                connection.exec(query)
              })()

              console.debug('cache cleanup success:', query)
            } else {
              console.debug('cache tidy:', mark)
            }
          } catch (error) {
            console.error('could not clean cache', error)
          }
        })
      },
      null,
      true,
      'UTC',
    )

    new CronJob(
      '0 */30 * * * *',
      async () => {
        this.read(async (connection) => {
          try {
            const config: any = connection
              .prepare('SELECT "limit" from "config";')
              .get()
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
        })
      },
      null,
      true,
      'UTC',
    )
  }

  public read(callback: (connection: PoolConnection) => void) {
    return this.query(this.reader, callback)
  }

  public write(callback: (connection: PoolConnection) => void) {
    return this.query(this.writer, callback)
  }

  private async query(
    pool: Pool,
    callback: (connection: PoolConnection) => void,
  ) {
    if (!callback || {}.toString.call(callback) !== '[object Function]') return

    return pool.acquire().then((connection) => {
      try {
        connection.pragma('journal_mode = WAL')
        connection.pragma('synchronous = NORMAL')
        connection.pragma('cache_size = -20480')

        callback(connection)
      } finally {
        connection.release()
      }
    })
  }
}
