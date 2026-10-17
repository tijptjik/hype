import { error } from '@sveltejs/kit'
import { resolveTheme, THEME_COOKIE } from '#lib/themes/themes.js'

// SVELTE
import { sequence, type Handle } from '@sveltejs/kit/hooks'

// I18N
import { paraglideMiddleware } from '#lib/paraglide/server.js'
// SECURITY
import { isScannerProbePath } from '#lib/utils/scannerProbe.js'
// DB
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, inArray } from 'drizzle-orm'
import * as schema from '#lib/db/schema/index.js'
import { retryBusyRead } from '#lib/db/services/sqlite.js'
import { autochunk } from '#lib/utils/batch-query.js'
// AUTH
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { getAuthForRequest } from '#lib/auth.js'
import { DEV_PERSONAS, isDevPersona, isDevPersonaHost } from '#lib/auth/dev-personas.js'
import {
  isAuthEntryPath,
  isPublicUnauthenticatedPath,
} from '#lib/auth/redirectGuard.js'
// TYPES
import type { LocaleKey, Session, SessionUser, UserRoleDisco } from '#lib/types.js'

import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import { isAdminRequest } from '#lib/api/index.js'

type HubShapeResult = { data: unknown }
type HubServiceModule = typeof import('#lib/api/services/hub.js')

type HubAdminRole = Extract<UserRoleDisco, { type: 'hub' }> & {
  hub?: { code?: string | null }
}

const EMPTY_HUB_I18N: Record<LocaleKey, Record<string, never>> = {
  en: {},
  zhHans: {},
  zhHant: {},
}

const toHubLocalsShape = (hub?: Partial<HubOptsExtended> | null): HubOptsExtended => ({
  code: hub?.code,
  domain: hub?.domain ?? null,
  legalContactAddress: hub?.legalContactAddress ?? null,
  id: hub?.id,
  isSubscriptionAvailable: hub?.isSubscriptionAvailable ?? false,
  subscriptionService: hub?.subscriptionService ?? null,
  subscriptionId: hub?.subscriptionId ?? null,
  subscriptionPlacement: hub?.subscriptionPlacement ?? undefined,
  i18n: hub?.i18n ?? EMPTY_HUB_I18N,
  image: hub?.image,
  isSuperAdmin: hub?.isSuperAdmin ?? false,
  isAdminRequest: hub?.isAdminRequest ?? false,
  isCore: hub?.isCore ?? hub?.code === 'core',
})

/**
 * Returns the hub codes for which the requester has an administrator role.
 *
 * @param roles - Roles associated with the authenticated user.
 * @returns A set of administrator hub codes.
 */
export function getAdminHubCodes(
  roles: readonly UserRoleDisco[] | undefined,
): Set<string> {
  return new Set(
    roles
      ?.filter(
        (role): role is HubAdminRole => role.type === 'hub' && role.role === 'admin',
      )
      .map(role => role.hub?.code)
      .filter((code): code is string => typeof code === 'string' && code.length > 0),
  )
}

// ═══════════════════════
// CORS HOOK
// ═══════════════════════
/**
 * This hook is used to add CORS headers to the response.
 * It is used to allow requests from other domains.
 */
const handle_cors = (async ({ event, resolve }) => {
  // Only add CORS headers in development mode
  if (import.meta.env.DEV) {
    const response = await resolve(event)

    // Redirect responses can expose immutable headers, so clone before mutation.
    const mutableResponse = new Response(response.body, response)

    mutableResponse.headers.set('Access-Control-Allow-Origin', '*')
    mutableResponse.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS',
    )
    mutableResponse.headers.set('Access-Control-Allow-Headers', '*')
    return mutableResponse
  }
  return resolve(event)
}) satisfies Handle

// ═══════════════════════
// SCANNER PROBE HOOK
// ═══════════════════════
/**
 * Rejects high-confidence credential-file and unused GraphQL probes with a
 * bad-request response before they reach the hub, authentication, and
 * database hooks.
 */
const handle_scanner_probe: Handle = ({ event, resolve }) => {
  // Return a bad-request response before any application hooks process a probe.
  if (isScannerProbePath(event.url.pathname)) {
    return new Response(null, { status: 400 })
  }

  return resolve(event)
}

// ═══════════════════════
// HUB HOOK
// ═══════════════════════
/**
 * This hook is used to set the hub info in the locals object.
 * It is used to filter the data in the database.
 * Unresolved hubs return 404 before the root layout reads the hub context.
 */
const handle_hub: Handle = async ({ event, resolve }) => {
  const hubServices: HubServiceModule = await import('#lib/api/services/hub.js')
  const { getHubFromDomain } = hubServices

  // Get host from headers
  const host = event.request.headers.get('host')

  // Allow a dev-only URL override so local hub switching does not depend on host setup.
  const devHubCodeOverride = import.meta.env.DEV
    ? (event.url.searchParams.get('hub') ?? undefined)
    : undefined

  // Get hub code from platform env for development override
  const hubCode = devHubCodeOverride || event.locals.platform?.env?.PUBLIC_HUB_CODE

  // Parse hub info from domain without DB lookup
  const hubOpts = getHubFromDomain(host, hubCode) as Partial<HubOptsExtended> & {
    code?: string
    domain?: string | null
    isCore?: boolean
  }

  // If on Core hub, don't lookup the hub in the database
  if (hubOpts.isCore) {
    event.locals.hub = toHubLocalsShape(hubOpts)
    return resolve(event)
  }

  // DB
  const db = drizzle(event.locals.platform?.env?.DB as unknown as MiniflareD1Database, {
    schema,
  })

  // Public hub resolution must remain one D1 read. Only the admin interface needs an
  // early session to see an unpublished hub before the regular session hook runs.
  let adminHubCodes = new Set<string>()
  if (!isAuthEntryPath(event.url.pathname) && isAdminRequest(event.request)) {
    try {
      const auth = getAuthForRequest(event.request.headers, {
        ENVIRONMENT: event.locals.platform.env.ENVIRONMENT,
        DB: event.locals.platform?.env?.DB as MiniflareD1Database,
        AUTH_SECRET: event.locals.platform?.env?.AUTH_SECRET ?? '',
        AUTH_GOOGLE_ID: event.locals.platform?.env?.AUTH_GOOGLE_ID ?? '',
        AUTH_GOOGLE_SECRET: event.locals.platform?.env?.AUTH_GOOGLE_SECRET ?? '',
        AUTH_FACEBOOK_ID: event.locals.platform?.env?.AUTH_FACEBOOK_ID ?? '',
        AUTH_FACEBOOK_SECRET: event.locals.platform?.env?.AUTH_FACEBOOK_SECRET ?? '',
        AUTH_EMAIL_FROM: event.locals.platform?.env?.AUTH_EMAIL_FROM,
        EMAIL: event.locals.platform?.env?.EMAIL,
      })
      const sessionData = await auth.api.getSession({ headers: event.request.headers })
      const sessionUser = sessionData?.user as SessionUser | undefined
      adminHubCodes = getAdminHubCodes(sessionUser?.roles)
    } catch {
      // Unavailable auth context must retain the guest-safe published hub filter.
    }
  }
  const canResolveUnpublishedHub =
    adminHubCodes.has('core') || adminHubCodes.has(hubOpts.code ?? '')

  if (db && event.locals && hubOpts.code) {
    const hubCode = hubOpts.code
    const hubDb = await retryBusyRead(() =>
      db.query.hub.findFirst({
        with: {
          i18n: true,
          image: true,
        },
        where: canResolveUnpublishedHub
          ? eq(schema.hub.code, hubCode)
          : and(
              eq(schema.hub.code, hubCode),
              eq(schema.hub.isPublished, true),
              eq(schema.hub.isArchived, false),
            ),
      }),
    )
    if (hubDb) {
      const hub = (await hubServices.toEntityResponseShape(
        hubDb,
        'card',
      )) as HubShapeResult

      event.locals.hub = toHubLocalsShape(hub.data as Partial<HubOptsExtended>)
    }
  } else if (db && event.locals && hubOpts.domain) {
    const hubDomain = hubOpts.domain
    const isCoreAdmin = adminHubCodes.has('core')
    let hubDb = await retryBusyRead(() =>
      db.query.hub.findFirst({
        with: {
          i18n: true,
          image: true,
        },
        where: isCoreAdmin
          ? eq(schema.hub.domain, hubDomain)
          : and(
              eq(schema.hub.domain, hubDomain),
              eq(schema.hub.isPublished, true),
              eq(schema.hub.isArchived, false),
            ),
      }),
    )

    if (!hubDb && !isCoreAdmin && adminHubCodes.size > 0) {
      // A hub admin may resolve an unpublished or archived hub they administer.
      const [adminHub] = await autochunk(
        { items: [...adminHubCodes], otherParametersCount: 1 },
        hubCodeBatch =>
          retryBusyRead(() =>
            db.query.hub.findMany({
              with: { i18n: true, image: true },
              where: and(
                eq(schema.hub.domain, hubDomain),
                inArray(schema.hub.code, hubCodeBatch),
              ),
            }),
          ),
      )

      hubDb = adminHub
    }

    const canUseDomainHub =
      Boolean(hubDb) &&
      (isCoreAdmin ||
        adminHubCodes.has(hubDb?.code ?? '') ||
        (hubDb?.isPublished && !hubDb?.isArchived))

    if (hubDb && canUseDomainHub) {
      const hub = (await hubServices.toEntityResponseShape(
        hubDb,
        'card',
      )) as HubShapeResult

      event.locals.hub = toHubLocalsShape(hub.data as Partial<HubOptsExtended>)
    }
  } else {
    // Default to Core
    event.locals.hub = toHubLocalsShape(hubOpts)
  }

  // An unknown or unpublished hub cannot supply the root layout's required context.
  if (!event.locals.hub) error(404, 'Hub not found')

  return resolve(event)
}

// ═══════════════════════
// BETTER-AUTH HOOK
// ═══════════════════════
/**
 * This hook sets up Better-Auth with the database connection
 * Better Auth's svelteKitHandler automatically handles /api/auth/* endpoints
 */
const handle_auth: Handle = async ({ event, resolve }) => {
  try {
    if (!event.locals.platform?.env?.DB) {
      console.error('🔴 Auth: No DB available for:', event.url.pathname)
      return resolve(event)
    }

    // AUTH - Get auth instance for this request's base URL
    const auth = getAuthForRequest(
      event.request.headers,
      {
        ENVIRONMENT: event.locals.platform.env.ENVIRONMENT,
        DB: event.locals.platform.env.DB,
        AUTH_SECRET: event.locals.platform.env.AUTH_SECRET,
        AUTH_GOOGLE_ID: event.locals.platform.env.AUTH_GOOGLE_ID,
        AUTH_GOOGLE_SECRET: event.locals.platform.env.AUTH_GOOGLE_SECRET,
        AUTH_FACEBOOK_ID: event.locals.platform.env.AUTH_FACEBOOK_ID,
        AUTH_FACEBOOK_SECRET: event.locals.platform.env.AUTH_FACEBOOK_SECRET,
        AUTH_EMAIL_FROM: event.locals.platform.env.AUTH_EMAIL_FROM,
        EMAIL: event.locals.platform.env.EMAIL,
      },
      event.locals.hub,
    )

    // SET LOCALS
    event.locals.auth = auth

    return svelteKitHandler({ event, resolve, auth, building: false })
  } catch (error) {
    console.error('🔴 Auth setup error:', error)
    return resolve(event)
  }
}

/**
 * Workaround to set session and user locals
 */
const handle_session_auth: Handle = async ({ event, resolve }) => {
  try {
    // if auth was not initialized for this request, don't try to fetch a session.
    // This is used for scripted requests that don't need auth.
    if (!event.locals.auth) {
      return resolve(event)
    }

    // LOCALS
    const sessionData = await event.locals.auth.api.getSession({
      headers: event.request.headers,
    })

    // Safely assign session and user data
    if (sessionData?.session && sessionData.user) {
      event.locals.session = sessionData.session as Session
      event.locals.user = sessionData.user as SessionUser
      const persona = import.meta.env.HYPE_DEV_PERSONA
      if (
        import.meta.env.DEV &&
        isDevPersona(persona) &&
        event.locals.platform.env.ENVIRONMENT === 'local' &&
        isDevPersonaHost(event.url, event.request.headers) &&
        sessionData.user.id === DEV_PERSONAS[persona].id
      ) {
        event.locals.devPersona = persona
      }
    }
  } catch (error) {
    console.error('🔴 Session auth error:', error)
    // Don't fail the request, just leave session/user undefined
    event.locals.session = undefined
    event.locals.user = undefined
  }

  return resolve(event)
}

// ═══════════════════════
// AUTH REDIRECT HOOK
// ═══════════════════════
/**
 * Protect account-only server routes while leaving normal app routes available
 * for client-driven guest bootstrap.
 */
const handle_auth_redirect: Handle = async ({ event, resolve }) => {
  if (isPublicUnauthenticatedPath(event.url.pathname)) {
    return resolve(event)
  }

  const isAdminPath =
    event.url.pathname === '/admin' || event.url.pathname.startsWith('/admin/')
  const hasAccount = Boolean(
    event.locals.session && event.locals.user && event.locals.user.isAnonymous !== true,
  )

  if (isAdminPath && !hasAccount) {
    const returnTo = `${event.url.pathname}${event.url.search}`
    return new Response(null, {
      status: 302,
      headers: {
        location: `/?upgrade=admin&returnTo=${encodeURIComponent(returnTo)}`,
      },
    })
  }

  return resolve(event)
}

// ═══════════════════════
// HUB ENRICHMENT HOOK
// ═══════════════════════
/**
 * This hook enriches the hub info with session data after auth runs.
 * It adds the superAdmin status to the hub options.
 * Only runs for API routes since only API routes need protection
 */
const handle_hub_enrichment: Handle = async ({ event, resolve }) => {
  // Only run for API routes where auth is available
  // LOCALS
  if (event.locals.hub) {
    // Cast user to SessionUser to access superAdmin property from custom session
    const { isCore } = await import('#lib/api/services/hub.js')

    const sessionUser = event.locals.user as SessionUser | undefined
    const hub = event.locals.hub as HubOptsExtended
    const CORE_HUB_CODE = 'core'
    let isHubAdminForActiveHub = false
    let isSuperAdmin = false

    if (sessionUser?.roles && hub?.code) {
      const adminHubCodes = getAdminHubCodes(sessionUser.roles)

      isHubAdminForActiveHub = adminHubCodes.has(hub.code)
      // Super admin = hub admin on the core hub.
      isSuperAdmin = adminHubCodes.has(CORE_HUB_CODE)
    }

    if (sessionUser) {
      sessionUser.isHubAdminForActiveHub = isHubAdminForActiveHub
      sessionUser.superAdmin = isSuperAdmin
    }
    hub.isSuperAdmin = isSuperAdmin
    // Admin Panel of App
    hub.isAdminRequest = isAdminRequest(event.request)
    // isCore Convenience property
    hub.isCore = isCore(hub)
  }
  return resolve(event)
}

// ═══════════════════════
// TRANSLATION HOOK
// ═══════════════════════
/**
 * This hook is used to add the paraglide middleware to the request.
 * It is used to translate the request to the correct locale.
 */
const translation: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    return resolve(
      { ...event, request: localizedRequest },
      {
        transformPageChunk: ({ html }) => {
          return html
            .replace('lang="en"', `lang="${event.locals.user?.locale || locale}"`)
            .replace(
              '%theme%',
              resolveTheme(
                event.cookies.get(THEME_COOKIE),
                event.locals.hub?.domain ?? event.url.hostname,
              ),
            )
        },
      },
    )
  })

// ═══════════════════════
// MAIN HOOK
// ═══════════════════════
/**
 * Makes native Worker bindings available to request-owned services.
 * @param input - SvelteKit request and resolver.
 * @returns The resolved response.
 * @remarks The Cloudflare adapter no longer populates event.platform in v3.
 */
const handle_worker_bindings: Handle = async ({ event, resolve }) => {
  // Static builds have no Worker bindings; Vite removes the native import from that target.
  if (import.meta.env.HYPE_STATIC_BUILD) return resolve(event)
  const { env, waitUntil } = await import('cloudflare:workers')
  event.locals.platform = {
    env,
    context: { waitUntil },
    caches: globalThis.caches,
  } as App.Platform
  return resolve(event)
}

/**
 * Establishes the local persona cookie before hub resolution reads the session.
 * @param input - SvelteKit request and resolver.
 * @returns A cookie-bearing retry redirect, or the ordinary request response.
 * @remarks Only document navigations auto-sign in; auth APIs retain their normal behavior.
 */
const handle_dev_persona: Handle = async ({ event, resolve }) => {
  const persona = import.meta.env.HYPE_DEV_PERSONA
  const env = event.locals.platform?.env
  if (
    !import.meta.env.DEV ||
    !isDevPersona(persona) ||
    env?.ENVIRONMENT !== 'local' ||
    !env.DB ||
    !isDevPersonaHost(event.url, event.request.headers) ||
    event.request.method !== 'GET' ||
    !event.request.headers.get('accept')?.includes('text/html')
  ) {
    return resolve(event)
  }
  // Do not let cross-site navigation automatically create a privileged session.
  const fetchSite = event.request.headers.get('sec-fetch-site')
  if (
    fetchSite === 'cross-site' ||
    (event.request.headers.has('origin') &&
      event.request.headers.get('origin') !== event.url.origin)
  ) {
    return new Response('Local development origin required', { status: 403 })
  }
  const auth = getAuthForRequest(event.request.headers, env)
  const current = await auth.api.getSession({ headers: event.request.headers })
  if (current?.user.id === DEV_PERSONAS[persona].id) event.locals.devPersona = persona
  if (current?.user.id === DEV_PERSONAS[persona].id) {
    return resolve(event)
  }
  // A browser retry sends the real signed cookie to the early hub hook and all later consumers.
  const headers = new Headers(event.request.headers)
  headers.set('origin', event.url.origin)
  const signedIn = await auth.handler(
    new Request(new URL('/api/auth/dev-persona', event.url), {
      method: 'POST',
      headers,
    }),
  )
  if (!signedIn.ok) return signedIn
  const responseHeaders = new Headers({
    location: event.url.pathname + event.url.search,
    'cache-control': 'no-store',
  })
  for (const cookie of signedIn.headers.getSetCookie())
    responseHeaders.append('set-cookie', cookie)
  return new Response(null, { status: 303, headers: responseHeaders })
}

/**
 * This is the main hook that is used to sequence the other hooks.
 */
const handle = sequence(
  handle_worker_bindings,
  handle_scanner_probe,
  handle_cors,
  handle_dev_persona,
  handle_hub,
  handle_auth,
  handle_session_auth,
  handle_auth_redirect,
  handle_hub_enrichment,
  translation,
)

export { handle }
