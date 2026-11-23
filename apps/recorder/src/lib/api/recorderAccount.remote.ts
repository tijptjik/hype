// SVELTE
import { query } from '$app/server'

/** @returns The remote HYPE identity. The native build only bundles the query proxy. */
export const recorderAccount = query((): { id: string; name: string | null } | null => {
  throw new Error('Recorder account queries must run on HYPE.')
})
