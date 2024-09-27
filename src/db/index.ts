import SqliteDb from 'better-sqlite3'
import { Kysely, Migrator, SqliteDialect } from 'kysely'
import { Database as SqliteDatabase } from 'better-sqlite3'
import { Config } from '../config'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'
import { Slack } from '../util/slack'

export class ApplicationDatabase {
  private master: Database
  private replica: Database

  constructor(cfg: Config) {
    const primary = new SqliteDb(cfg.sqliteLocation)
    const secondary = new SqliteDb(cfg.sqliteReplicaLocation)

    const WAL = 'journal_mode = WAL'

    primary.pragma(WAL)
    secondary.pragma(WAL)

    const replicate = async (db: SqliteDatabase, event: any) => {
      try {
        if (
          event.level === 'query' &&
          !event.query.sql.toLowerCase().startsWith('select')
        ) {
          db.prepare(event.query.sql).run(event.query.parameters)
        }
      } catch (err) {
        const alert = `replication failed\n${err}\n${JSON.stringify(event)}`
        console.log(alert)
        Slack.send(alert)
      }
    }

    this.master = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: primary }),
      log(event: any): void {
        replicate(secondary, event)
      },
    })

    this.replica = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: secondary }),
    })
  }

  public get(): Database {
    return this.master
  }

  public async migrateToLatest() {
    ;[this.master, this.replica].forEach(async (db) => {
      const migrator = new Migrator({ db, provider: migrationProvider })
      const { error } = await migrator.migrateToLatest()
      if (error) throw error
    })
  }
}

export type Database = Kysely<DatabaseSchema>
