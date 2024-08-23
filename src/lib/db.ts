import { type GeneratedAlways, Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { PlatformProxy } from 'wrangler';
import type { D1Database } from '@auth/d1-adapter';

// SCHEMA
export interface Database {
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


// DB CONNECTOR
interface connectParams {
	database?: D1Database;
	platform?: PlatformProxy;
}

export const connect = (params:connectParams) => {
	let db;
	console.log('platform', params?.platform);
	console.log('database', params?.database);
	if (params?.database !== undefined && params?.database !== null) {
		db = params?.database;
	} else if (params?.platform !== undefined && params?.platform !== null) {
		console.log(params?.platform);
		db = params?.platform?.env.DB
	} else {
		throw new Error('Either platform or database must be defined');
	}
	return new Kysely<Database>({ dialect: new D1Dialect({ database: db }) });
};


