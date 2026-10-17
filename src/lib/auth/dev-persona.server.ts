// BETTER AUTH
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
// AUTH
import { DEV_PERSONAS, isDevPersonaHost, type DevPersona } from './dev-personas'
// TYPES
import type { BetterAuthPlugin } from 'better-auth'

/**
 * Issues a real Better Auth session for a previously seeded local persona.
 * @param persona - Persona validated by the local development launcher.
 * @returns A server-only, same-origin sign-in endpoint.
 * @remarks Register only in validated development mode; the endpoint never seeds users.
 */
export function devPersonaPlugin(persona: DevPersona): BetterAuthPlugin {
  return {
    id: 'hype-local-persona',
    endpoints: {
      signInDevPersona: createAuthEndpoint(
        '/dev-persona',
        { method: 'POST' },
        async ctx => {
          const request = ctx.request
          if (
            !request ||
            !isDevPersonaHost(new URL(request.url), request.headers) ||
            request.headers.get('origin') !== new URL(request.url).origin
          ) {
            throw new APIError('FORBIDDEN', {
              message: 'Local development origin required',
            })
          }
          const identity = DEV_PERSONAS[persona]
          const user = await ctx.context.internalAdapter.findUserById(identity.id)
          if (
            !user ||
            user.email !== identity.email ||
            user.name !== identity.name ||
            ('isArchived' in user && user.isArchived) ||
            ('isAnonymous' in user && user.isAnonymous)
          ) {
            throw new APIError('FORBIDDEN', {
              message: 'Run bun run dev:agent after restoring the local mirror',
            })
          }
          // Use Better Auth's adapter and cookie writer so every session consumer sees this identity.
          const session = await ctx.context.internalAdapter.createSession(user.id)
          if (!session)
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Could not create local session',
            })
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ persona })
        },
      ),
    },
  }
}
