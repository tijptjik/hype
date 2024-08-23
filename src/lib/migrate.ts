import { type Migration, type MigrationProvider, Migrator } from 'kysely';
import { connect } from '$lib/db';
import type { D1Database } from '@auth/d1-adapter';

class FileMigrationProvider {
	async getMigrations(): Promise<Record<string, Migration>> {
		// @ts-ignore
		return import.meta.glob('../../migrations/**.ts', {
			eager: true
		// @ts-ignore
		}) satisfies MigrationProvider;
	}
}

async function getDB() {
	let db: D1Database;
	if (process.env.VITE_USER_NODE_ENV === 'development') {
		const { getPlatformProxy } = await import('wrangler');
		console.log('getPlatformProxy', getPlatformProxy);
		try {
			const { env } = await getPlatformProxy();
			console.log('env', env);
			console.log('Env initialised for local development', env);
			db = connect({ database: env.DB });
		} catch (e) {
			console.log(e);
		}
	} else {
		console.log('PROD DB')
		db = connect({ database: process.env.DB });
	}
	return db;
}


export async function migrateToLatest() {
	console.log('VITE_USER_NODE_ENV', process.env.VITE_USER_NODE_ENV);
	const db = await getDB();
	const migrator = new Migrator({
		db,
		provider: new FileMigrationProvider(),
		allowUnorderedMigrations: true
	});
	console.log('Migrator', migrator);

	const { error, results } = await migrator.migrateToLatest();

	results?.forEach((it) => {
		if (it.status === 'Success') {
			console.log(`migration "${it.migrationName}" was executed successfully`);
		} else if (it.status === 'Error') {
			console.error(`failed to execute migration "${it.migrationName}"`);
		}
	});

	if (error) {
		console.error('failed to migrate');
		console.error(error);
		process.exit(1);
	}
	await db.destroy();
}