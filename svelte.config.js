import adapterStatic from '@sveltejs/adapter-static';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Build an SSR version of the app for Cloudflare, or a static version when targeting Android.
const selectAdapter = () => {
  if (process.env.SVELTE_ADAPTER === 'static') {
    return adapterStatic({
      fallback: 'index.html',
      pages: 'build-static',
      assets: 'build-static'
    });
  } else {
    return adapterCloudflare({
      // See https://kit.svelte.dev/docs/adapter-cloudflare
      routes: {
        include: ['/*'],
        exclude: ['<all>']
      }
    });
  }
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  compilerOptions: {
    runes: true,
    // disable all warnings coming from node_modules and all accessibility warnings
    warningFilter: (warning) =>
      !warning.filename?.includes('node_modules') &&
      !warning.code.startsWith('a11y') &&
      !warning.message.startsWith('Unused CSS selector') &&
      !warning.message.startsWith('You are using Svelte 5.0.0') &&
      warning.code !== 'css-unused-selector'
  },
  preprocess: vitePreprocess(),
  kit: {
    adapter: selectAdapter(),
    env: {
      privatePrefix: 'PRIVATE',
      publicPrefix: 'PUBLIC'
    }
  }
};

export default config;
