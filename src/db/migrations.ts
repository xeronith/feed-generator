import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('text', 'text', (col) => col.notNull())
      .addColumn('author', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('feed')
      .addColumn('identifier', 'varchar(15)', (col) => col.primaryKey())
      .addColumn('displayName', 'varchar', (col) => col.notNull())
      .addColumn('description', 'text', (col) => col.notNull())
      .addColumn('definition', 'text', (col) => col.notNull())
      .addColumn('did', 'varchar', (col) => col.notNull())
      .addColumn('avatar', 'varchar', (col) => col.notNull())
      .addColumn('pinned', 'integer', (col) => col.notNull())
      .addColumn('favorite', 'integer', (col) => col.notNull())
      .addColumn('type', 'varchar', (col) => col.notNull())
      .addColumn('state', 'varchar', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .addColumn('updatedAt', 'varchar', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
    await db.schema.dropTable('feed').execute()
  },
}

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('cache')
      .addColumn('identifier', 'varchar(15)', (col) => col.primaryKey())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('refreshedAt', 'varchar', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('cache').execute()
  },
}

migrations['003'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('post')
      .addColumn('createdAt', 'varchar')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('createdAt').execute()
  },
}

migrations['004'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('query_log')
      .addColumn('feedIdentifier', 'varchar(15)', (col) => col.notNull())
      .addColumn('userDid', 'varchar', (col) => col.notNull())
      .addColumn('userHandle', 'varchar', (col) => col.notNull())
      .addColumn('target', 'varchar', (col) => col.notNull())
      .addColumn('query', 'varchar', (col) => col.notNull())
      .addColumn('duration', 'integer', (col) => col.notNull())
      .addColumn('successful', 'integer', (col) => col.notNull())
      .addColumn('errorMessage', 'varchar', (col) => col.notNull())
      .addColumn('timestamp', 'integer', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('feedIdentifierIndex')
      .on('query_log')
      .column('feedIdentifier')
      .execute()
    await db.schema
      .createIndex('userDidIndex')
      .on('query_log')
      .column('userDid')
      .execute()
    await db.schema
      .createIndex('userHandleIndex')
      .on('query_log')
      .column('userHandle')
      .execute()
    await db.schema
      .createIndex('targetIndex')
      .on('query_log')
      .column('target')
      .execute()
    await db.schema
      .createIndex('durationIndex')
      .on('query_log')
      .column('duration')
      .execute()
    await db.schema
      .createIndex('successfulIndex')
      .on('query_log')
      .column('successful')
      .execute()
    await db.schema
      .createIndex('timestampIndex')
      .on('query_log')
      .column('timestamp')
      .execute()
    await db.schema
      .createIndex('createdAtIndex')
      .on('query_log')
      .column('createdAt')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    db.schema.dropIndex('feedIdentifierIndex').on('query_log').execute()
    db.schema.dropIndex('userDidIndex').on('query_log').execute()
    db.schema.dropIndex('userHandleIndex').on('query_log').execute()
    db.schema.dropIndex('targetIndex').on('query_log').execute()
    db.schema.dropIndex('durationIndex').on('query_log').execute()
    db.schema.dropIndex('successfulIndex').on('query_log').execute()
    db.schema.dropIndex('timestampIndex').on('query_log').execute()
    db.schema.dropIndex('createdAtIndex').on('query_log').execute()
    await db.schema.dropTable('query_log').execute()
  },
}
