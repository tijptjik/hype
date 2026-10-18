// BETTER-AUTH
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { passkey } from '@better-auth/passkey'
import { customSession, anonymous, username, magicLink } from 'better-auth/plugins'
// DRIZZLE
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// CONFIG
import { authConfig } from './auth/config'
import { buildAuthEmail } from './auth/email'
import { isAuthProviderEnabled } from './auth/providers'
import { parseSessionSettings } from './auth/session-settings'
import { requireAvailableAuthUser } from './auth/account-state.server'
import { breadlineClaimIntegration } from './auth/breadline-claim.server'
import { passwordSetup } from './auth/password-setup.server'
import { devPersonaPlugin } from './auth/dev-persona.server'
import { isDevPersona, isDevPersonaHost } from './auth/dev-personas'
// DB SCHEMA
import * as schema from '#lib/db/schema/index.js'
// TYPES
import type { D1Database as MiniflareD1Database } from '@cloudflare/workers-types'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { UserRoleDisco, Locale } from '#lib/types.js'
import type {
  UserExperimental,
  UserPreferences,
} from '#lib/db/zod/schema/user.types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { user as userSchema } from '#lib/db/schema/user.js'
import { migrateAnonymousUserState } from '#lib/auth/anonymous.server.js'
import { createAuthDiagnosticId } from '#lib/auth/diagnostics.server.js'

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
    ENVIRONMENT?: string
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
  const emailLink = magicLink({
    expiresIn: 15 * 60,
    storeToken: 'hashed',
    sendMagicLink: async ({ email: to, url }) => {
      if (!env.EMAIL || !env.AUTH_EMAIL_FROM)
        throw new Error('Transactional email is not configured')
      const { fromName, ...email } = buildAuthEmail({
        kind: 'sign-in',
        actionUrl: url,
        baseURL,
        hub,
      })
      await env.EMAIL.send({
        to,
        from: { email: env.AUTH_EMAIL_FROM, name: fromName },
        ...email,
      })
    },
  })
  const breadline = breadlineClaimIntegration(
    env.DB,
    drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    async (email, context) => {
      // Nested endpoint execution retains the validated auth request and callback constraints.
      await emailLink.endpoints.signInMagicLink({
        ...context,
        headers: context.headers ?? new Headers(),
        body: {
          email,
          callbackURL:
            typeof context.body?.callbackURL === 'string'
              ? context.body.callbackURL
              : '/',
        },
      })
    },
  )
  const persona = import.meta.env.HYPE_DEV_PERSONA
  const localPersona =
    import.meta.env.DEV &&
    isDevPersona(persona) &&
    env.ENVIRONMENT === 'local' &&
    isDevPersonaHost(new URL(baseURL), new Headers({ host: new URL(baseURL).host }))
      ? persona
      : null

  return betterAuth({
    // COMMON CONFIG
    ...authConfig,
    // BASE URL (dynamic per domain)
    baseURL,
    ...(localPersona
      ? { trustedOrigins: [...authConfig.trustedOrigins, baseURL] }
      : {}),
    // OAuth callbacks can lose their short-lived state cookie after a browser
    // restart or a local dev reload. Send that failure back to a usable HYPE
    // entry point instead of Better Auth's internal error route.
    onAPIError: {
      errorURL: `${baseURL}/signin`,
    },
    // ENV
    secret: env.AUTH_SECRET,
    // DB
    database: breadline.adapter,
    user: { ...authConfig.user, validateUserInfo: breadline.validateUserInfo },
    // ADVANCES SETTINGS
    advanced: {
      // Preserve shared cookie attributes required for secure embedded sessions.
      ...authConfig.advanced,
      // Local personas use isolated cookies that also work over loopback HTTP.
      ...(localPersona
        ? {
            cookiePrefix: `hype-dev-agent-${localPersona}`,
            useSecureCookies: baseURL.startsWith('https:'),
            defaultCookieAttributes: {
              sameSite: 'lax' as const,
              secure: baseURL.startsWith('https:'),
              partitioned: false,
            },
          }
        : {}),
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    // Recheck account availability even when Better Auth accepts a cached session payload.
    hooks: {
      before: createAuthMiddleware(async ctx => {
        // A display spelling must identify the same canonical username.
        if (
          typeof ctx.body?.username === 'string' &&
          typeof ctx.body?.displayUsername === 'string' &&
          ctx.body.username.trim().toLowerCase() !==
            ctx.body.displayUsername.trim().toLowerCase()
        ) {
          throw new APIError('BAD_REQUEST', {
            message: 'Username and display username must match.',
          })
        }
        // Supply both fields before the plugin short-circuits casing-only edits.
        if (ctx.path === '/update-user' || ctx.path === '/sign-up/email') {
          if (
            typeof ctx.body?.username === 'string' &&
            ctx.body.displayUsername === undefined
          ) {
            ctx.body.displayUsername = ctx.body.username.trim()
          } else if (
            typeof ctx.body?.displayUsername === 'string' &&
            ctx.body.username === undefined
          ) {
            ctx.body.username = ctx.body.displayUsername.trim().toLowerCase()
          }
        }
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
        update: {
          before: async data => {
            // A profile edit cannot reserve an unclaimed import's email or establish ownership.
            await breadline.assertEmailChange(data.email)
            return { data }
          },
        },
        create: {
          before: async user => {
            // Generate username if not provided
            const dbUser = user as Partial<typeof userSchema.$inferSelect>
            if (!dbUser.username && dbUser.isAnonymous !== true) {
              const { generateDisplayUsernameFromId } = await import(
                '#lib/utils/username-generator.server.js'
              )
              const displayUsername = generateDisplayUsernameFromId(user.id)
              const username = displayUsername.toLowerCase()
              return {
                data: {
                  ...user,
                  username,
                  displayUsername,
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
      ...(localPersona ? [devPersonaPlugin(localPersona)] : []),
      emailLink,
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
        // Preserve user-chosen casing separately; canonical usernames remain lowercase.
        minUsernameLength: 1,
        maxUsernameLength: 32,
        displayUsernameValidator: value => /^[a-zA-Z0-9_]{1,32}$/.test(value.trim()),
        usernameNormalization: value => value.trim().toLowerCase(),
        displayUsernameNormalization: value => value.trim(),
        usernameValidator: async username => {
          const canonical = username.trim().toLowerCase()
          if (!/^[a-z0-9_]{1,32}$/.test(canonical) || canonical === 'admin') {
            return false
          }

          // Better Auth handles username uniqueness and permits casing-only edits.
          // Keep user IDs reserved so profile routes cannot resolve ambiguously.
          const { user } = await import('#lib/db/schema/user.js')
          const { eq } = await import('drizzle-orm')

          const existingUser = await db
            .select()
            .from(user)
            .where(eq(user.id, canonical))
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
        const { getUserRoles } = await import('#lib/db/services/user.js')

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
            telephone: dbUser.telephone ?? null,
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
    ENVIRONMENT?: string
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
  const cacheKey = `${baseURL}:${hub?.code ?? 'core'}:${env.ENVIRONMENT ?? ''}:${import.meta.env.HYPE_DEV_PERSONA ?? ''}`

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
  displayUsername: string | null
  isAnonymous: boolean
  preferences: UserPreferences
  experimental: UserExperimental
  superAdmin: boolean
  isHubAdminForActiveHub: boolean
  roles: UserRoleDisco[]
}
export type SessionSession = Session['session']
