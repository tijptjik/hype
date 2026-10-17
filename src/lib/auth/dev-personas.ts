/** Dedicated identities reserved for local development; never reuse mirrored users. */
export const DEV_PERSONAS = {
  admin: {
    id: 'hype-local-agent-admin',
    name: 'Local agent admin',
    username: 'local_agent_admin',
    email: 'agent-admin@hype.invalid',
  },
  user: {
    id: 'hype-local-agent-user',
    name: 'Local agent user',
    username: 'local_agent_user',
    email: 'agent-user@hype.invalid',
  },
} as const
export type DevPersona = keyof typeof DEV_PERSONAS

/**
 * Narrows an explicit development persona.
 * @param value - Untrusted configuration value.
 * @returns Whether the value names a supported persona.
 */
export function isDevPersona(value: unknown): value is DevPersona {
  return value === 'admin' || value === 'user'
}

/**
 * Restricts automatic authentication to approved local request authorities.
 * @param url - Actual request URL, not a forwarded host.
 * @param headers - Incoming request headers.
 * @returns Whether both authorities agree on an approved local origin.
 */
export function isDevPersonaHost(url: URL, headers: Headers): boolean {
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]', 'hype.localhost'].includes(url.hostname) &&
    headers.get('host') === url.host
  )
}
