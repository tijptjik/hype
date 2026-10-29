// TYPES
import type { HotPayload, Plugin } from 'vite'

/**
 * Keeps development pages on manual refresh without disabling SSR invalidation.
 * @returns A development-only Vite plugin that filters browser update messages.
 * @remarks `server.hmr: false` also disables the SSR module runner's reload handling,
 * allowing inactive importers to retain older generated translation modules.
 */
export function manualBrowserUpdates(): Plugin {
  return {
    name: 'manual-browser-updates',
    apply: 'serve',
    configureServer(server): void {
      const send = server.ws.send.bind(server.ws)

      // Filter only browser mutations; SSR uses a separate in-process hot channel.
      server.ws.send = (payload: HotPayload | string, data?: unknown): void => {
        if (typeof payload === 'string') {
          send(payload, data)
          return
        }
        if (
          payload.type === 'update' ||
          payload.type === 'full-reload' ||
          payload.type === 'prune'
        ) {
          return
        }
        send(payload)
      }
    },
  }
}
