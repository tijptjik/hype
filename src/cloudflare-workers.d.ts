/** Native bindings exposed by the Cloudflare runtime and SvelteKit adapter. */
declare module 'cloudflare:workers' {
  export const env: App.Platform['env']
  export function waitUntil(promise: Promise<unknown>): void
}
