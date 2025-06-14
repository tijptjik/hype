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
      },
      precompress: true
    });
  }
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  compilerOptions: {
    runes: true,
    experimental: {
      async: true
    },
    // disable all warnings coming from node_modules and all accessibility warnings
    warningFilter: (warning) =>
      !warning.filename?.includes('node_modules') &&
      !warning.code.startsWith('a11y') &&
      !warning.message.startsWith('State referenced in its own') &&
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
    },
    csrf: {
      checkOrigin: false
    }
  },
  vitePlugin: {
    // Required to avoid runes mode being enforce for all node_modules
    // https://github.com/sveltejs/svelte/issues/9632#issuecomment-1825498213
    dynamicCompileOptions({ filename }) {
      if (filename.includes('node_modules')) {
        return { runes: undefined }; // or false, check what works
      }
    }
  }
};

export default config;
