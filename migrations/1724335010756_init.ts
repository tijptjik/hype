import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	// up migration code goes here...
	// note: up migrations are mandatory. you must implement this function.
	// For more info, see: https://kysely.dev/docs/migrations
	await db.schema
		.createTable('User')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('name', 'text')
		.addColumn('email', 'text', (col) => col.unique().notNull())
		.addColumn('emailVerified', 'text')
		.addColumn('image', 'text')
		.execute();

	await db.schema
		.createTable('Account')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('userId', 'text', (col) => col.references('User.id').onDelete('cascade').notNull())
		.addColumn('type', 'text', (col) => col.notNull())
		.addColumn('provider', 'text', (col) => col.notNull())
		.addColumn('providerAccountId', 'text', (col) => col.notNull())
		.addColumn('refresh_token', 'text')
		.addColumn('access_token', 'text')
		.addColumn('expires_at', 'bigint')
		.addColumn('token_type', 'text')
		.addColumn('scope', 'text')
		.addColumn('id_token', 'text')
		.addColumn('session_state', 'text')
		.execute();

	await db.schema
		.createTable('Session')
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('userId', 'text', (col) => col.references('User.id').onDelete('cascade').notNull())
		.addColumn('sessionToken', 'text', (col) => col.notNull().unique())
		.addColumn('expires', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createTable('VerificationToken')
		.addColumn('identifier', 'text', (col) => col.notNull())
		.addColumn('token', 'text', (col) => col.notNull().unique())
		.addColumn('expires', 'text', (col) => col.notNull())
		.execute();

	await db.schema
		.createIndex('Account_userId_index')
		.on('Account')
		.column('userId')
		.execute();

	await db.schema
		.createIndex('Session_userId_index')
		.on('Session')
		.column('userId')
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	// down migration code goes here...
	// note: down migrations are optional. you can safely delete this function.
	// For more info, see: https://kysely.dev/docs/migrations
	await db.schema.dropTable('Account').ifExists().execute();
	await db.schema.dropTable('Session').ifExists().execute();
	await db.schema.dropTable('User').ifExists().execute();
	await db.schema.dropTable('VerificationToken').ifExists().execute();
}
