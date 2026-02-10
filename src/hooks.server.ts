// SVELTE
import { sequence } from '@sveltejs/kit/hooks'
import type { Handle } from '@sveltejs/kit'
import { and, eq, or } from 'drizzle-orm'
// I18N
import { paraglideMiddleware } from '$lib/paraglide/server'
// DB
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '$lib/db/schema/index'
import { getHubByCode, getHubByDomain } from '$lib/db/services/hub'
// AUTH
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { getAuthForRequest } from '$lib/auth'
// SERVICES
import { toResponseShape } from '$lib/api/services/hub'
// TYPES
import type { HubOptsExtended, Session, SessionUser } from '$lib/types'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'
import { isAdminRequest } from '$lib/api'
import { HubRoleType } from '$lib/enums'

let handle: Handle

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
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS',
    )
    response.headers.set('Access-Control-Allow-Headers', '*')
    return response
  }
  return resolve(event)
}) satisfies Handle

// ═══════════════════════
// HUB HOOK
// ═══════════════════════
/**
 * This hook is used to set the hub info in the locals object.
 * It is used to filter the data in the database.
 */
const handle_hub: Handle = async ({ event, resolve }) => {
  // Get host from headers
  const host = event.request.headers.get('host')

  // Get hub code from platform env for development override
  const hubCode = event.platform?.env?.PUBLIC_HUB_CODE

  // Parse hub info from domain without DB lookup
  const { getHubFromDomain } = await import('$lib/api/services/hub')
  const hubOpts = getHubFromDomain(host, hubCode)

  // If on Core hub, don't lookup the hub in the database
  if (hubOpts.isCore) {
    event.locals.hub = hubOpts as HubOptsExtended
    return resolve(event)
  }

  // DB
  const db = drizzle(event.platform?.env?.DB as unknown as MiniflareD1Database, {
    schema,
  })

  if (db && event.locals && hubOpts.code) {
    const hubDb = await getHubByCode(db, hubOpts.code)
    if (hubDb) {
      const hub = (await toResponseShape(hubDb, false)) as HubOptsExtended
      event.locals.hub = hub
    }
  } else if (db && event.locals && hubOpts.domain) {
    const hubDb = await getHubByDomain(db, hubOpts.domain)
    if (hubDb) {
      const hub = (await toResponseShape(hubDb, false)) as HubOptsExtended
      event.locals.hub = hub
    }
  } else {
    // Default to Core
    event.locals.hub = hubOpts as HubOptsExtended
  }

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
    if (!event.platform?.env?.DB) {
      console.error('🔴 Auth: No DB available for:', event.url.pathname)
      return resolve(event)
    }

    // DB
    const db = drizzle(event.platform.env.DB as unknown as MiniflareD1Database, {
      schema,
    })

    // AUTH - Get auth instance for this request's base URL
    const auth = getAuthForRequest(event.request.headers, db, {
      AUTH_SECRET: event.platform.env.AUTH_SECRET,
      AUTH_GOOGLE_ID: event.platform.env.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: event.platform.env.AUTH_GOOGLE_SECRET,
    })

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
    // LOCALS
    const sessionData = await event.locals.auth.api.getSession({
      headers: event.request.headers,
    })

    // Safely assign session and user data
    if (sessionData && sessionData.session && sessionData.user) {
      event.locals.session = sessionData.session as Session
      event.locals.user = sessionData.user as SessionUser
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
 * This hook redirects unauthenticated users to the home page
 * when they try to access protected routes.
 */
const handle_auth_redirect: Handle = async ({ event, resolve }) => {
  // Get the pathname, handling null/undefined cases
  const pathname = event.url.pathname || ''

  // Skip redirect for API routes, static assets, home page, and empty paths
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/static/') ||
    pathname === '/' ||
    pathname === '' ||
    pathname === '/manifest.webmanifest'
  ) {
    return resolve(event)
  }

  // Check if user is authenticated
  const isAuthenticated = event.locals.session && event.locals.user

  // Redirect unauthenticated users to home page
  if (!isAuthenticated) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/',
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
    const { isCore } = await import('$lib/api/services/hub')
    const sessionUser = event.locals.user as SessionUser | undefined
    const hub = event.locals.hub as HubOptsExtended
    const CORE_HUB_CODE = 'core'

    let isHubAdminForActiveHub = false
    let isSuperAdmin = false

    if (sessionUser?.id && hub?.code && event.platform?.env?.DB) {
      const db = drizzle(event.platform.env.DB as unknown as MiniflareD1Database, {
        schema,
      })

      const adminHubRoles = await db
        .select({ hubCode: schema.hub.code })
        .from(schema.hubRole)
        .innerJoin(schema.hub, eq(schema.hub.id, schema.hubRole.hubId))
        .where(
          and(
            eq(schema.hubRole.userId, sessionUser.id),
            eq(schema.hubRole.role, HubRoleType.admin),
            or(eq(schema.hub.code, CORE_HUB_CODE), eq(schema.hub.code, hub.code)),
          ),
        )
        .all()

      const adminHubCodes = new Set(adminHubRoles.map(role => role.hubCode))
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
    event.request = localizedRequest
    return resolve(event, {
      transformPageChunk: ({ html }) => {
        return html.replace('%lang%', event.locals.user?.locale || locale)
      },
    })
  })

// ═══════════════════════
// MAIN HOOK
// ═══════════════════════
/**
 * This is the main hook that is used to sequence the other hooks.
 */

handle = sequence(
  handle_cors,
  handle_hub,
  handle_auth,
  handle_session_auth,
  handle_auth_redirect,
  handle_hub_enrichment,
  translation,
)

export { handle }
