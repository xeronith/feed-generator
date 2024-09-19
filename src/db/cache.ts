import dotenv from 'dotenv'
import { CronJob } from 'cron'
import * as path from 'path'
import { GetFolderSizeInBytes } from '../util/fs'
import { Slack } from '../util/slack'
import { Pool, PoolConnection } from 'better-sqlite-pool'

export class CacheDatabase {
  private writer: Pool
  private reader: Pool

  constructor() {
    dotenv.config()
    const location = path.join(
      path.dirname(process.env.FEEDGEN_SQLITE_LOCATION ?? '.'),
      'cache.db',
    )

    this.writer = new Pool(location)

    this.reader = new Pool(location, {
      max: 100,
      readonly: true,
    })

    this.write((connection) => {
      connection.exec(`CREATE TABLE IF NOT EXISTS "config" ("limit" INTEGER);`)
      connection.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS "post" 
                            USING FTS5("uri", "author", "text", "indexedAt");`)
    })

    new CronJob(
      '0 0 0 * * *',
      () => {
        this.write((connection) => {
          try {
            connection.exec(
              `DELETE FROM "post" WHERE
                "indexedAt" < DATETIME('now', '-7 day')`,
            )

            console.debug('cache cleanup')
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
      '0 */10 * * * *',
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
        connection.pragma('cache_size = -32768')

        callback(connection)
      } finally {
        connection.release()
      }
    })
  }
}

const CacheDatabaseInstance = new CacheDatabase()

export default CacheDatabaseInstance
