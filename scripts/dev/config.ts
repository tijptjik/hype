// CLOUDFLARE
import { unstable_readConfig } from 'wrangler'
// AUTH
import { isDevPersona, type DevPersona } from '../../src/lib/auth/dev-personas.ts'

/**
 * Validates the exact adapter configuration before enabling local automatic login.
 * @param env - Launcher or Vite process environment.
 * @returns The selected persona, or null for ordinary development.
 * @remarks Refuses named environments, static builds, remote D1, and nonlocal DB names.
 */
export function getDevPersona(env: NodeJS.ProcessEnv): DevPersona | null {
  const value = env.HYPE_DEV_PERSONA
  if (!value) return null
  if (
    !isDevPersona(value) ||
    env.CLOUDFLARE_ENV ||
    (env.SVELTE_ADAPTER && env.SVELTE_ADAPTER !== 'cloudflare') ||
    env.HYPE_LOCAL_R2 !== '1'
  ) {
    throw new Error(
      'dev:agent requires admin/user, local bindings, and no Cloudflare environment or static adapter',
    )
  }
  const config = unstable_readConfig({ config: './wrangler.local.toml' })
  const databases = config.d1_databases.filter(
    (binding: { binding: string; remote?: boolean; database_name?: string }) =>
      binding.binding === 'DB',
  )
  if (
    databases.length !== 1 ||
    databases[0].remote ||
    databases[0].database_name !== 'hype-db-local' ||
    config.vars.ENVIRONMENT !== 'local'
  ) {
    throw new Error('dev:agent requires the local hype-db-local D1 binding')
  }
  return value
}
