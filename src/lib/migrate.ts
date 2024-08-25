import { type Migration, Migrator } from 'kysely';
import { connect } from '../lib/db';
import type { D1Database } from '@auth/d1-adapter';
import FastGlob from 'fast-glob';
import * as path from 'node:path';


class FileMigrationProvider {
	private globPath: string;

	constructor(globPath: string) {
		this.globPath = globPath;
	}

	async getMigrations(): Promise<Record<string, Migration>> {
		const importPaths: string[] = await FastGlob(this.globPath);
		const migrations: Record<string, Migration> = {};
		for (const importPath of importPaths) {
			const migrationName: string = importPath.substring(
				importPath.lastIndexOf('/') + 1, importPath.lastIndexOf('.')
			);
			migrations[migrationName] = await import(path.join(process.cwd(), importPath));
		}
		return migrations;
	}
}

// Obtain a database connection OUTSIDE of the cloudflate worker context,
// so this should only be used in local development / during builds on CF.
async function getDB() {
	let db: D1Database;
	if (process.env.VITE_USER_NODE_ENV === 'development' || process.env.WRANGLER_ENV === 'cf') {
		const { getPlatformProxy } = await import('wrangler');
		console.log('getPlatformProxy', getPlatformProxy);
		try {
			const { env } = await getPlatformProxy();
			console.log('env', env);
			console.log('Env initialised for local development', env);
			db = connect(env.DB);
		} catch (e) {
			console.log(e);
		}
	} else {
		console.log('CLOUDFLARE PLATFORM with ENV', process.env);
		console.log('DB', process.env.DB);
		db = connect(process.env.DB);
	}
	return db;
}


export async function migrateToLatest({ glob }: { glob: string }) {
	if (glob === undefined) {
		glob = '../../migrations/*.js';
	}
	const db = await getDB();
	const migrator = new Migrator({
		db,
		provider: new FileMigrationProvider(glob),
		allowUnorderedMigrations: true
	});
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