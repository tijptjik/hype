// BETTER-AUTH
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import { customSession, anonymous, username } from 'better-auth/plugins'
// CONFIG
import { authConfig } from './auth/config'
import { isAuthProviderEnabled } from './auth/providers'
// DB SCHEMA
import * as schema from '$lib/db/schema/index'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type { UserRoleDisco, Locale } from '$lib/types'
import type { UserExperimental, UserPreferences } from '$lib/db/zod/schema/user.types'
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
 * Extract the base URL from request headers.
 * Uses x-forwarded-proto and x-forwarded-host headers if available (from reverse proxy),
 * otherwise falls back to development defaults.
 */
export function getBaseUrlFromRequestHeaders(headers: Headers): string {
  const proto =
    headers.get('x-forwarded-proto') ?? (import.meta.env.DEV ? 'http' : 'https')
  const host = headers.get('x-forwarded-host') ?? headers.get('host')

  if (!host) {
    throw new Error('Cannot determine host from request headers')
  }

  return `${proto}://${host}`
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
) {
  const db = drizzle(env.DB, { schema })

  return betterAuth({
    // COMMON CONFIG
    ...authConfig,
    // BASE URL (dynamic per domain)
    baseURL,
    // ENV
    secret: env.AUTH_SECRET,
    // DB
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    // DATABASE HOOKS
    databaseHooks: {
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
      sendResetPassword: async ({ user, url }) => {
        if (!env.EMAIL || !env.AUTH_EMAIL_FROM) {
          throw new Error('Transactional email is not configured')
        }
        await env.EMAIL.send({
          to: user.email,
          from: { email: env.AUTH_EMAIL_FROM, name: 'HYPE' },
          subject: 'Reset your HYPE password',
          text: `Reset your HYPE password: ${url}`,
          html: `<p>Reset your HYPE password:</p><p><a href="${url}">${url}</a></p>`,
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (!env.EMAIL || !env.AUTH_EMAIL_FROM) {
          throw new Error('Transactional email is not configured')
        }
        await env.EMAIL.send({
          to: user.email,
          from: { email: env.AUTH_EMAIL_FROM, name: 'HYPE' },
          subject: 'Verify your HYPE email',
          text: `Verify your HYPE email: ${url}`,
          html: `<p>Verify your HYPE email:</p><p><a href="${url}">${url}</a></p>`,
        })
      },
    },
    // PLUGINS
    plugins: [
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

        // Parse JSON fields from strings to objects
        let preferences: UserPreferences
        let experimental: UserExperimental

        try {
          preferences = JSON.parse(dbUser.preferences)
        } catch {
          preferences = {
            fallbackLocales: [],
            allowMachineTranslation: false,
            preferFallbackInCurrentLocale: false,
            isTranslateButtonVisible: true,
          }
        }

        try {
          experimental = JSON.parse(dbUser.experimental)
        } catch {
          experimental = {
            contributorMode: false,
            noLabelsMode: false,
          }
        }

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
 * Auth instances are cached by base URL to support multiple domains.
 *
 * @param headers - The request headers to extract the base URL from
 * @param env - Environment variables containing D1 binding, auth secrets, and OAuth credentials
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
): Auth => {
  const baseURL = getBaseUrlFromRequestHeaders(headers)

  // Return cached instance if available
  const cachedAuth = authInstances.get(baseURL)
  if (cachedAuth) {
    return cachedAuth
  }

  // Create new instance for this base URL
  const auth = createAuthInstance(env, baseURL)
  authInstances.set(baseURL, auth)

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
