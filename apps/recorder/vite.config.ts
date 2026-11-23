// VITE
import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import adapter from '@sveltejs/adapter-static'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter({ fallback: 'index.html' }),
      experimental: { remoteFunctions: true },
    }),
  ],
  define: {
    'import.meta.env.VITE_RECORDER_DEBUG': JSON.stringify(
      String(
        process.env.HYPE_RECORDER_FI === '1' && process.env.TAURI_ENV_DEBUG === 'true',
      ),
    ),
  },
  css: { postcss: { plugins: [] } },
  server: {
    host: process.env.TAURI_DEV_HOST || '127.0.0.1',
    watch: { ignored: ['**/src-tauri/**'] },
  },
  clearScreen: false,
})
