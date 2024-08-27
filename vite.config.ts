import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { defineConfig, type Plugin } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import seed from './src/lib/db/seed';

const seedDrizzle = async (): Promise<Plugin> => {
  if (process.env.VITE_WRANGLER_ENV !== 'local') {
    return {
      name: 'no-seed-on-prod',
      apply: 'build'
    } satisfies Plugin;
  } else {
    return {
      name: 'seed-drizzle',
      apply: 'serve',
      buildStart() {
        seed();
      }
    } satisfies Plugin;
  }
};

export default defineConfig({
  plugins: [
    paraglide({
      project: './project.inlang',
      outdir: './src/lib/paraglide'
    }),
    seedDrizzle(),
    sveltekit()
  ],
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'es2020'
  }
});
