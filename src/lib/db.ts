// import { FileMigrationProvider, type GeneratedAlways, Kysely, Migrator } from 'kysely';
import { type GeneratedAlways, Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { PlatformProxy } from 'wrangler';


interface Database {
	User: {
		id: GeneratedAlways<string>
		name: string | null
		email: string
		emailVerified: Date | null
		image: string | null
	};
	Account: {
		id: GeneratedAlways<string>
		userId: string
		type: string
		provider: string
		providerAccountId: string
		refresh_token: string | null
		access_token: string | null
		expires_at: number | null
		token_type: string | null
		scope: string | null
		id_token: string | null
		session_state: string | null
	};
	Session: {
		id: GeneratedAlways<string>
		userId: string
		sessionToken: string
		expires: Date
	};
	VerificationToken: {
		identifier: string
		token: string
		expires: Date
	};
}

export const connect = (platform: Readonly<App.Platform> | PlatformProxy | undefined) => {
	if (platform === null || platform === undefined) {
		throw new Error('Platform not found');
	}
	return new Kysely<Database>({ dialect: new D1Dialect({ database: platform?.env.DB }) });
};

//
// if (dev) {
// 	const { getPlatformProxy } = await import('wrangler');
// 	const platform: PlatformProxy<Record<string, unknown>> = await getPlatformProxy();
// 	console.log('Platform initialised for local development', platform);
//
// 	// eslint-disable-next-line @typescript-eslint/no-unused-vars
// 	const db = initDB(platform);
//
// 	// const migrator = new Migrator({
// 	// 	db,
// 	// 	provider: new FileMigrationProvider('../../migrations'),
// 	// 	allowUnorderedMigrations: true
// 	// });
// 	//
// 	// const { result, error } = await migrator.migrateToLatest();
// 	// console.log(result);
// 	// console.log(error);
// }


