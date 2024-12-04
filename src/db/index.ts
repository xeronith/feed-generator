import SqliteDb from 'better-sqlite3'
import { CronJob } from 'cron'
import { Kysely, Migrator, SqliteDialect } from 'kysely'
import { Database as SqliteDatabase } from 'better-sqlite3'
import { Config } from '../config'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'
import { Telegram } from '../util/telegram'

export class ApplicationDatabase {
  private primary: SqliteDb.Database
  private master: Database

  private replica: Database
  private secondary: SqliteDb.Database

  constructor(cfg: Config) {
    const WAL = 'journal_mode = WAL'

    const primary = new SqliteDb(cfg.sqliteLocation)
    primary.pragma(WAL)

    const replicaEnabled = cfg.sqliteReplicaLocation ?? false
    if (replicaEnabled) {
      const secondary = new SqliteDb(cfg.sqliteReplicaLocation)
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
          Telegram.send(alert)
        }
      }

      this.primary = primary
      this.master = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({ database: this.primary }),
        log(event: any): void {
          replicate(secondary, event)
        },
      })

      this.secondary = secondary
      this.replica = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({ database: this.secondary }),
      })
    } else {
      this.primary = primary
      this.master = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({ database: this.primary }),
      })
    }

    new CronJob(
      `0 0 0 * * *`,
      () => {
        const cutoff = new Date(
          new Date().getTime() - 48 * 60 * 60 * 1000,
        ).toISOString()

        try {
          console.debug('draft feeds cleanup attempt:', cutoff)

          this.master
            .deleteFrom('feed')
            .where('state', '=', 'draft')
            .where('createdAt', '<', cutoff)
            .execute()

          console.debug('draft feeds cleanup success:', cutoff)
        } catch (error) {
          console.error('could not clean draft feeds', error)
        }
      },
      null,
      true,
      'UTC',
    )
  }

  public get(): Database {
    return this.master
  }

  public async migrateToLatest() {
    const db = this.master
    const migrator = new Migrator({ db, provider: migrationProvider })
    const { error } = await migrator.migrateToLatest()
    if (error) throw error

    this.primary.exec(
      `
        CREATE TABLE IF NOT EXISTS "audit_log" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "table" VARCHAR NOT NULL,
          "createdAt" VARCHAR NOT NULL,
          "record" JSON NOT NULL
        )
      `,
    )

    const tables = this.primary
      .prepare(
        `
          SELECT "name" FROM "sqlite_master"
          WHERE "type"='table'
            AND "name" NOT LIKE 'sqlite_%'
            AND "name" NOT LIKE 'kysely_%';
        `,
      )
      .all()

    tables.forEach((table: any) => {
      if (table.name === 'audit_log' || table.name === 'cache') return

      const columns = this.primary
        .prepare(
          `
            SELECT "name"
            FROM pragma_table_info('${table.name}')
            ORDER BY "cid";
          `,
        )
        .all()

      const values = columns
        .map((e: any) => `'${e.name}', OLD."${e.name}"`)
        .join(', ')

      this.primary.exec(
        `
          BEGIN;
            DROP TRIGGER IF EXISTS "${table.name}_audit";
            CREATE TRIGGER "${table.name}_audit"
            BEFORE UPDATE ON "${table.name}"
            BEGIN
              INSERT INTO "audit_log" ("table", "createdAt", "record")
              VALUES ('${table.name}', CURRENT_TIMESTAMP, JSON_OBJECT(${values}));
            END;
          COMMIT;
        `,
      )
    })
  }
}

export type Database = Kysely<DatabaseSchema>
