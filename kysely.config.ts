// import { defineConfig } from 'kysely-ctl';
// import type { PlatformProxy } from 'wrangler';
// import { connect } from './src/lib/db';
// import { D1Dialect } from 'kysely-d1';
//
// // My function
//
// const dialect = (async () => {
// 	const platform: PlatformProxy<Record<string, unknown>> = await (await import('wrangler')).getPlatformProxy();
// 	return connect(platform.env.DB);
// })();
//
// export default defineConfig({
// 	// replace me with a real dialect instance OR a dialect name + `dialectConfig` prop.
// 	dialect: new D1Dialect({ database: dialect })
// 	// migrations: {
// 	//   migrationFolder: "migrations",
// 	//   },
// 	//   plugins: [],
// 	//   seeds: {
// 	//     seedFolder: "seeds",
// 	//   }
// });
