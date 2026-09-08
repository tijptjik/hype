// BETTER-AUTH
import { betterAuth } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import { customSession, anonymous, username } from 'better-auth/plugins'
// DRIZZLE
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// CONFIG
import { authConfig } from './auth/config'
import { buildAuthEmail } from './auth/email'
import { isAuthProviderEnabled } from './auth/providers'
import { parseSessionSettings } from './auth/session-settings'
import { requireAvailableAuthUser } from './auth/account-state.server'
import { passwordSetup } from './auth/password-setup.server'
// DB SCHEMA
import * as schema from '$lib/db/schema/index'
// TYPES
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { UserRoleDisco, Locale } from '$lib/types'
import type { UserExperimental, UserPreferences } from '$lib/db/zod/schema/user.types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type { user as userSchema } from '$lib/db/schema/user'
import { migrateAnonymousUserState } from '$lib/auth/anonymous.server'
import { createAuthDiagnosticId } from '$lib/auth/diagnostics.server'

// ═══════════════════════════════════════════════════════════════
// CACHE: AUTH INSTANCES BY BASE URL
// ═══════════════════════════════════════════════════════════════

/**
 * Cache for auth instances keyed by base URL.
 * This allows us to support multiple domains with a single better-auth setup.
 */
const authInstances = new Map<string, Auth>()

/**
 * Marks an email address as verified after its owner has redeemed a password-reset token.
 *
 * @param db - The D1-backed Drizzle database used by the active authentication instance.
 * @param userId - The ID encoded in the single-use reset token redeemed by Better Auth.
 * @returns Nothing after the user's verified-email state is persisted.
 * @remarks A password-reset token is sent only to the account email address, so redeeming it
 * proves mailbox control to the same standard as an email-verification link.
 */
export async function markEmailVerifiedAfterPasswordReset(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<void> {
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.id, userId))
}

/**
 * Extracts the authentication origin from the same host used for hub routing.
 * @param headers - Incoming request headers at the Cloudflare ingress.
 * @returns A validated HTTP(S) origin, preserving local development ports.
 * @remarks Cloudflare overwrites X-Forwarded-Proto, but not X-Forwarded-Host.
 * Never let a forwarded host redirect reset tokens or expand trusted auth origins.
 * Missing protocol headers fall back to development/production defaults.
 */
export function getBaseUrlFromRequestHeaders(headers: Headers): string {
  const proto =
    headers.get('x-forwarded-proto') ?? (import.meta.env.DEV ? 'http' : 'https')
  const host = headers.get('host')

  if (!host) {
    throw new Error('Cannot determine host from request headers')
  }

  // Accept only a host authority, not URL credentials, paths, or proxy header lists.
  if ((proto !== 'http' && proto !== 'https') || /[\s/@\\?#,]/.test(host)) {
    throw new Error('Invalid authentication origin headers')
  }
  const origin = new URL(`${proto}://${host}`)
  return origin.origin
}

// ═══════════════════════════════════════════════════════════════
// FACTORY: CREATE AUTH INSTANCE
// ═══════════════════════════════════════════════════════════════

/**
 * Create a single auth instance with the D1 database, environment variables, and a specific base URL.
 * This function is called internally by getAuthForRequest.
 *
 * @param env - Environment variables containing D1 binding, auth secrets, and OAuth credentials
 * @param baseURL - The base URL for this auth instance (e.g., https://example.com)
 * @param hub - Resolved hub context used to brand transactional email.
 */
function createAuthInstance(
  env: {
    DB: MiniflareD1Database
    AUTH_SECRET: string
    AUTH_GOOGLE_ID: string
    AUTH_GOOGLE_SECRET: string
    AUTH_FACEBOOK_ID: string
    AUTH_FACEBOOK_SECRET: string
    AUTH_EMAIL_FROM?: string
    EMAIL?: App.Platform['env']['EMAIL']
  },
  baseURL: string,
  hub?: HubOptsExtended,
) {
  const db = drizzle(env.DB, { schema })

  return betterAuth({
    // COMMON CONFIG
    ...authConfig,
    // BASE URL (dynamic per domain)
    baseURL,
    // OAuth callbacks can lose their short-lived state cookie after a browser
    // restart or a local dev reload. Send that failure back to a usable HYPE
    // entry point instead of Better Auth's internal error route.
    onAPIError: {
      errorURL: `${baseURL}/signin`,
    },
    // ENV
    secret: env.AUTH_SECRET,
    // DB
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    // ADVANCES SETTINGS
    advanced: {
      // Preserve shared cookie attributes required for secure embedded sessions.
      ...authConfig.advanced,
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    // Recheck account availability even when Better Auth accepts a cached session payload.
    hooks: {
      before: createAuthMiddleware(async ctx => {
        // Clearing a disabled account's session must remain possible.
        if (ctx.path === '/sign-out') return
        const current = await getSessionFromCtx(ctx, { disableRefresh: true })
        if (current) await requireAvailableAuthUser(db, current.user.id)
      }),
    },
    // DATABASE HOOKS
    databaseHooks: {
      session: {
        create: {
          before: async session => {
            // All sign-in methods converge here after identifying the account owner.
            await requireAvailableAuthUser(db, session.userId)
            return { data: session }
          },
        },
      },
      user: {
        create: {
          before: async user => {
            // Generate username if not provided
            const dbUser = user as Partial<typeof userSchema.$inferSelect>
            if (!dbUser.username && dbUser.isAnonymous !== true) {
              const { generateUsernameFromId } = await import(
                '$lib/utils/username-generator.server'
              )
              const username = generateUsernameFromId(user.id)
              return {
                data: {
                  ...user,
                  username,
                },
              }
            }
            return { data: user }
          },
        },
      },
    },
    // OAUTH
    socialProviders: {
      ...(isAuthProviderEnabled('google') &&
      env.AUTH_GOOGLE_ID &&
      env.AUTH_GOOGLE_SECRET
        ? {
            google: {
              clientId: env.AUTH_GOOGLE_ID,
              clientSecret: env.AUTH_GOOGLE_SECRET,
            },
          }
        : {}),
      ...(isAuthProviderEnabled('facebook') &&
      env.AUTH_FACEBOOK_ID &&
      env.AUTH_FACEBOOK_SECRET
        ? {
            facebook: {
              clientId: env.AUTH_FACEBOOK_ID,
              clientSecret: env.AUTH_FACEBOOK_SECRET,
            },
          }
        : {}),
    },
    // EMAIL + PASSWORD
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        // Redeeming the reset token proves the user controls their registered mailbox.
        await markEmailVerifiedAfterPasswordReset(db, user.id)
      },
      sendResetPassword: async ({ user, url }) => {
        if (!env.EMAIL || !env.AUTH_EMAIL_FROM) {
          throw new Error('Transactional email is not configured')
        }
        const { fromName, ...email } = buildAuthEmail({
          kind: 'password-reset',
          actionUrl: url,
          baseURL,
          hub,
          recipientName: user.name,
        })

        await env.EMAIL.send({
          to: user.email,
          from: { email: env.AUTH_EMAIL_FROM, name: fromName },
          ...email,
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (!env.EMAIL || !env.AUTH_EMAIL_FROM) {
          throw new Error('Transactional email is not configured')
        }
        const { fromName, ...email } = buildAuthEmail({
          kind: 'verification',
          actionUrl: url,
          baseURL,
          hub,
          recipientName: user.name,
        })

        await env.EMAIL.send({
          to: user.email,
          from: { email: env.AUTH_EMAIL_FROM, name: fromName },
          ...email,
        })
      },
    },
    // PLUGINS
    plugins: [
      passwordSetup(),
      passkey({
        rpID: new URL(baseURL).hostname,
        rpName: 'HYPE',
        origin: baseURL,
        registration: {
          // A returning guest has no separate credential with which to refresh
          // a session before turning it into their first durable sign-in method.
          // Better Auth still resolves and requires that existing session.
          requireSession: false,
          afterVerification: async ({ user }) => {
            // Correlate registration with the subsequent custom account-promotion request.
            console.info({
              event: 'auth.passkey.registration',
              outcome: 'verified',
              origin: baseURL,
              rpID: new URL(baseURL).hostname,
              userIdHash: await createAuthDiagnosticId(user.id),
            })
          },
        },
      }),
      username({
        usernameValidator: async username => {
          if (username === 'admin') {
            return false
          }

          // Check if username conflicts with existing usernames or user IDs
          const { user } = await import('$lib/db/schema/user')
          const { or, eq } = await import('drizzle-orm')

          const existingUser = await db
            .select()
            .from(user)
            .where(or(eq(user.username, username), eq(user.id, username)))
            .limit(1)

          return existingUser.length === 0
        },
      }),
      anonymous({
        generateName: () => 'Guest account',
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await migrateAnonymousUserState(db, anonymousUser.user, newUser.user)
        },
      }),

      customSession(async ({ user, session }) => {
        // Import these here to avoid circular dependencies
        const { getUserRoles } = await import('$lib/db/services/user')

        // Guest accounts cannot hold roles, so avoid an unnecessary D1 query.
        const dbUser = user as typeof userSchema.$inferSelect
        const roles: UserRoleDisco[] = dbUser.isAnonymous
          ? []
          : await getUserRoles(db, user.id)
        const superAdmin = roles.some(role => {
          if (role.type !== 'hub' || role.role !== 'admin') return false
          const hubRole = role as unknown as { hub?: { code?: string } }
          return hubRole.hub?.code === 'core'
        })

        // Parse and validate JSON fields before clients dereference their settings.
        const { preferences, experimental } = parseSessionSettings(
          dbUser.preferences,
          dbUser.experimental,
        )

        // Return enriched session data
        return {
          user: {
            ...user,
            preferences,
            experimental,
            roles,
            superAdmin,
            // Set in hooks.server.ts
            isHubAdminForActiveHub: false,
          },
          session,
        }
      }),
    ],
  })
}

// ═══════════════════════════════════════════════════════════════
// FACTORY: GET AUTH FOR REQUEST (CACHED)
// ═══════════════════════════════════════════════════════════════

/**
 * Get or create an auth instance for the current request.
 * Auth instances are cached by base URL and hub code to support multiple domains
 * and local hub switching during development.
 *
 * @param headers - The request headers to extract the base URL from
 * @param env - Environment variables containing D1 binding, auth secrets, and OAuth credentials
 * @param hub - Resolved hub context used to brand transactional email.
 * @returns An auth instance configured for this request's domain
 */
export const getAuthForRequest = (
  headers: Headers,
  env: {
    DB: MiniflareD1Database
    AUTH_SECRET: string
    AUTH_GOOGLE_ID: string
    AUTH_GOOGLE_SECRET: string
    AUTH_FACEBOOK_ID: string
    AUTH_FACEBOOK_SECRET: string
    AUTH_EMAIL_FROM?: string
    EMAIL?: App.Platform['env']['EMAIL']
  },
  hub?: HubOptsExtended,
): Auth => {
  const baseURL = getBaseUrlFromRequestHeaders(headers)
  const cacheKey = `${baseURL}:${hub?.code ?? 'core'}`

  // Return cached instance if available
  const cachedAuth = authInstances.get(cacheKey)
  if (cachedAuth) {
    return cachedAuth
  }

  // Create new instance for this base URL
  const auth = createAuthInstance(env, baseURL, hub)
  authInstances.set(cacheKey, auth)

  return auth
}

// Export types using Better Auth's inference
export type Auth = ReturnType<typeof createAuthInstance>
export type Session = Auth['$Infer']['Session']
export type SessionUser = Session['user'] & {
  locale: Locale
  attribution: string
  isArchived: boolean
  username: string | null
  isAnonymous: boolean
  preferences: UserPreferences
  experimental: UserExperimental
  superAdmin: boolean
  isHubAdminForActiveHub: boolean
  roles: UserRoleDisco[]
}
export type SessionSession = Session['session']
