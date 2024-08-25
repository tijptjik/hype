import { defineConfig, type Plugin } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { migrateToLatest } from './src/lib/migrate';

function ClosePlugin() : Plugin {
    return {
        name: 'ClosePlugin', // required, will show up in warnings and errors

        // use this to catch errors when building
        buildEnd(error) {
            if(error) {
                console.error('Error bundling')
                console.error(error)
                process.exit(1)
            } else {
                console.log('Build ended')
            }
        },

        // use this to catch the end of a build without errors
        closeBundle(id) {
            console.log('Bundle closed')
            process.exit(0)
        },
    } satisfies Plugin
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
		sveltekit(),
		// Migrations are defined in TSC, but migrations are run as JS to avoid import issues.
		kyselyMigration({ glob: 'migrations/*.js' }),
		ClosePlugin()
	]
});
