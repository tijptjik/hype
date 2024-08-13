import adapterStatic from '@sveltejs/adapter-static';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Build a SSR version of the app for Cloudflare, or a static version when targeting Android.
const adapter = process.env.SVELTEADAPTER === 'cloudflare' ? adapterCloudflare : adapterStatic;

const adapterConfig =
	process.env.ADAPTER === 'cloudflare'
		? {
			// See https://kit.svelte.dev/docs/adapter-cloudflare
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			}
		}
		: {
			fallback: 'index.html',
			pages: 'build-static',
			assets: 'build-static'
		};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	compilerOptions: {
		// disable all warnings coming from node_modules and all accessibility warnings
		warningFilter: (warning) => !warning.filename?.includes('node_modules') && !warning.code.startsWith('a11y')
	},
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(adapterConfig)
	},
};

export default config;
