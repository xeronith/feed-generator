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
    db.schema.dropIndex('feedIdentifierIndex').execute()
    db.schema.dropIndex('userDidIndex').execute()
    db.schema.dropIndex('userHandleIndex').execute()
    db.schema.dropIndex('targetIndex').execute()
    db.schema.dropIndex('durationIndex').execute()
    db.schema.dropIndex('successfulIndex').execute()
    db.schema.dropIndex('timestampIndex').execute()
    db.schema.dropIndex('createdAtIndex').execute()
    await db.schema.dropTable('query_log').execute()
  },
}

migrations['005'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('user_log')
      .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
      .addColumn('userDid', 'varchar', (col) => col.notNull())
      .addColumn('userHandle', 'varchar', (col) => col.notNull())
      .addColumn('activity', 'varchar', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('timestamp', 'integer', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('userLog_userDidIndex')
      .on('user_log')
      .column('userDid')
      .execute()
    await db.schema
      .createIndex('userLog_userHandleIndex')
      .on('user_log')
      .column('userHandle')
      .execute()
    await db.schema
      .createIndex('userLog_activityIndex')
      .on('user_log')
      .column('activity')
      .execute()
    await db.schema
      .createIndex('userLog_timestampIndex')
      .on('user_log')
      .column('timestamp')
      .execute()
    await db.schema
      .createIndex('userLog_createdAtIndex')
      .on('user_log')
      .column('createdAt')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    db.schema.dropIndex('userLog_userDidIndex').execute()
    db.schema.dropIndex('userLog_userHandleIndex').execute()
    db.schema.dropIndex('userLog_activityIndex').execute()
    db.schema.dropIndex('userLog_timestampIndex').execute()
    db.schema.dropIndex('userLog_createdAtIndex').execute()
    await db.schema.dropTable('user_log').execute()
  },
}

migrations['006'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('feed')
      .renameColumn('favorite', 'bookmark')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema
      .alterTable('feed')
      .renameColumn('bookmark', 'favorite')
      .execute()
  },
}

migrations['007'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('feed')
      .addColumn('slug', 'varchar', (col) => col.defaultTo(''))
      .execute()

    await db.schema
      .createIndex('feed_didSlugIndex')
      .unique()
      .on('feed')
      .columns(['did', 'slug'])
      .execute()
  },
  async down(db: Kysely<unknown>) {
    db.schema.dropIndex('feed_didSlugIndex').execute()
  },
}

migrations['008'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable('feed')
      .addColumn('deletedAt', 'varchar', (col) => col.defaultTo(''))
      .execute()

    await db.schema
      .createIndex('feed_deletedAtIndex')
      .on('feed')
      .column('deletedAt')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    db.schema.dropIndex('feed_deletedAtIndex').execute()
    await db.schema.alterTable('feed').dropColumn('deletedAt').execute()
  },
}
