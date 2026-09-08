// AUTH
import {
  APIError,
  changeEmail,
  createAuthEndpoint,
  createAuthMiddleware,
  freshSessionMiddleware,
  isAPIError,
  sensitiveSessionMiddleware,
  setPassword,
} from 'better-auth/api'
// VALIDATION
import { z } from 'zod'
// TYPES
import type { BetterAuthPlugin } from 'better-auth'

/**
 * Registers first-password setup behind Better Auth's HTTP rate limiter.
 * @returns A plugin with a same-origin, account-only credential endpoint.
 * @remarks The app route delegates through auth.handler, not auth.api. Direct API
 * calls do not execute the HTTP limiter. Existing passwords cannot be replaced.
 */
export function passwordSetup(): BetterAuthPlugin {
  return {
    id: 'hype-password-setup',
    endpoints: {
      setupAccountPassword: createAuthEndpoint(
        '/account-password',
        {
          method: 'POST',
          body: z.object({ newPassword: z.string(), email: z.string().optional() }),
          use: [
            createAuthMiddleware(async ctx => {
              // Match the app route's strict same-origin boundary even for direct callers.
              if (ctx.headers?.get('origin') !== new URL(ctx.context.baseURL).origin) {
                throw new APIError('FORBIDDEN', { message: 'FORBIDDEN' })
              }
            }),
            sensitiveSessionMiddleware,
            // Freshness must be evaluated only after bypassing the signed cookie cache.
            freshSessionMiddleware,
          ],
        },
        async ctx => {
          const user = ctx.context.session.user
          if ('isAnonymous' in user && user.isAnonymous === true) {
            throw new APIError('FORBIDDEN', { message: 'ACCOUNT_REQUIRED' })
          }
          const { email, newPassword } = ctx.body
          try {
            let emailChangeResponse: Response | undefined
            // Request verification before changing the login email when the user overrides it.
            if (email && email.trim().toLowerCase() !== user.email.toLowerCase()) {
              // Preserve Better Auth's refreshed session cache so the browser receives the new email.
              emailChangeResponse = await changeEmail({
                ...ctx,
                body: {
                  newEmail: email.trim(),
                  callbackURL: `${new URL(ctx.context.baseURL).origin}/?panel=profile`,
                },
                asResponse: true,
              })
              // Raw responses carry API failures as HTTP status instead of throwing.
              // Do not create credentials after the requested email change was rejected.
              if (!emailChangeResponse.ok) {
                throw new APIError('BAD_REQUEST', { message: 'PASSWORD_NOT_SET' })
              }
            }
            await setPassword({ ...ctx, body: { newPassword }, asResponse: false })
            // Nested endpoints share this request's response headers; do not append cookies twice.
            return ctx.json({ status: true })
          } catch (cause) {
            console.warn('[auth][set-password]', {
              outcome: 'rejected',
              userId: user.id,
              cause,
            })
            throw new APIError(
              isAPIError(cause) ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
              {
                message: 'PASSWORD_NOT_SET',
              },
            )
          }
        },
      ),
    },
  }
}
