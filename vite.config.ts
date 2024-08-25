import { defineConfig, type Plugin } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { migrateToLatest } from './src/lib/migrate';

const kyselyMigration = async ({ glob }: { glob: string }): Promise<Plugin> => {
	return {
		name: 'kysely-migration',
		apply: process.env.NODE_ENV === 'development' ? 'serve' : 'build',
		configResolved() {
			migrateToLatest({ glob: glob });
		}
	} satisfies Plugin ;
};

export default defineConfig({
	plugins: [
		sveltekit(),
		// Migrations are defined in TSC, but migrations are run as JS to avoid import issues.
		// kyselyMigration({ glob: 'migrations/*.js' })
	]
});
