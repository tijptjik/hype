import { defineConfig, type Plugin } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { migrateToLatest } from './src/lib/migrate';

let runningBundles = 0;

async function ClosePlugin(name, maxWaitTime = 10): Promise<Plugin> {
	return {
		name: 'ClosePlugin', // required, will show up in warnings and errors
		// use this to catch errors when building
		buildStart() {
			if (this.meta.watchMode) {
				return;
			}

			runningBundles++;
			this.info(`${name}: Starting build, ${runningBundles} build(s) running`);
		},
		buildEnd(error) {

			if (error) {
				console.error('Error bundling');
				console.error(error);
				process.exit(1);
			} else {
				console.log('Build ended');
			}
		},

		// use this to catch the end of a build without errors
		async closeBundle() {
			if (this.meta.watchMode) {
				return;
			}
			runningBundles--;
			const timeout = setTimeout(() => {
				if (runningBundles === 0) {
					this.info(
						`${name}: Rollup is now done, but did not exit before ${maxWaitTime} seconds, force exiting...`
					);
					process.exit(0);
				} else {
					this.info(
						`${name}: Rollup is still working on another build process, waiting for ${runningBundles} running bundle(s) before force exit`
					);
				}
			}, maxWaitTime * 1000);
			// Allow the NodeJS process to finish without waiting for the timeout, using it only as a fallback for
			// otherwise hanging Rollup processes
			timeout.unref();
		}
	} satisfies Plugin;
}


const kyselyMigration = async ({ glob }: { glob: string }): Promise<Plugin> => {
	return {
		name: 'kysely-migration',
		apply: process.env.NODE_ENV === 'development' ? 'serve' : 'build',
		configResolved() {
			migrateToLatest({ glob: glob });
		}
	} satisfies Plugin;
};

export default defineConfig({
	plugins: [
		// Migrations are defined in TSC, but migrations are run as JS to avoid import issues.
		kyselyMigration({ glob: 'migrations/*.js' }),
		sveltekit(),
		ClosePlugin('Build Closer')
	]
});
