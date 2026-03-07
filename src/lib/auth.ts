// BETTER-AUTH
import { betterAuth } from 'better-auth'
import { customSession, anonymous, username } from 'better-auth/plugins'
// CONFIG
import { authConfig } from './auth/config'
// DB SCHEMA
import * as schema from '$lib/db/schema/index'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import type {
  UserRoleDisco,
  UserLayer,
  UserPreferences,
  UserExperimental,
  Locale,
} from '$lib/types'
import type { user as userSchema } from '$lib/db/schema/user'

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
    database: env.DB,
    // DATABASE HOOKS
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            // Generate username if not provided
            const dbUser = user as Partial<typeof userSchema.$inferSelect>
            if (!dbUser.username) {
              const { generateUsernameFromId } = await import('$lib/utils/username')
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
      google: {
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
      },
    },
    // PLUGINS
    plugins: [
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
        disableDeleteAnonymousUser: true,
        generateName: () => 'Anonymous',
        onLinkAccount: async ({ anonymousUser }) => {
          // Mark the user as no longer anonymous when linking accounts
          const { user } = await import('$lib/db/schema/user')
          const { eq } = await import('drizzle-orm')

          await db
            .update(user)
            .set({ isAnonymous: false })
            .where(eq(user.id, anonymousUser.user.id))
        },
      }),

      customSession(async ({ user, session }) => {
        // Import these here to avoid circular dependencies
        const { getUserRoles } = await import('$lib/db/services/user')
        const { getUserLayers } = await import('./client/services/auth')

        // Get user roles and layers
        const roles: UserRoleDisco[] = await getUserRoles(db, user.id)
        const userLayers: UserLayer[] = await getUserLayers(db, user.id)
        const superAdmin = roles.some(role => {
          if (role.type !== 'hub' || role.role !== 'admin') return false
          const hubRole = role as unknown as { hub?: { code?: string } }
          return hubRole.hub?.code === 'core'
        })

        // Parse JSON fields from strings to objects
        let preferences: UserPreferences
        let experimental: UserExperimental

        try {
          const dbUser = user as typeof userSchema.$inferSelect
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
          const dbUser = user as typeof userSchema.$inferSelect
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
            userLayers,
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
  userLayers: UserLayer[]
}
export type SessionSession = Session['session']
