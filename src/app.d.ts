// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env : {
				AUTH_GOOGLE_ID : string;
				AUTH_GOOGLE_SECRET : string;
				AUTH_SECRET : string;
				COUNTER : DurableObjectNamespace;
				DB: D1Database;
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache }
		}
	}
}

export {};
