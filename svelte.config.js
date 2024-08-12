import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),
  onwarn: (warning, handler) => {
    if (warning.code.startsWith('a11y-')) return;
    if (warning.code === 'missing-exports-condition') return;
    if (warning.code === 'a11y-no-static-element-interactions') return;
    if (warning.code === 'svelte-ignore a11y-autofocus') return;
    if (warning.code.startsWith('css-unused-selector')) return;
    handler(warning);
  },
	kit: {
    adapter: adapter({
      // See https://kit.svelte.dev/docs/adapter-cloudflare
      routes: {
        include: ['/*'],
        exclude: ['<all>']
      }
    })
  }
};

export default config;
