// SVELTE
import { error } from '@sveltejs/kit'
// THIRD PARTY
import { z } from 'zod'
// DB
import { hub } from '#lib/db/schema/index.js'
import { FormBoolean } from '#lib/db/zod/form.js'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { getScopedHubAdminIds, isCoreHubAdmin } from '#lib/api/services/authz/hub.js'
import { resolveAnalyticsScope, toAuthMessage } from '#lib/api/services/authz/index.js'
import { canAccessAnalytics } from '#lib/api/services/authz/user.js'
// SERVER
import { fetchPlatformAnalytics } from '#lib/api/services/platformAnalytics.js'
import {
  fetchAssetAnalyticsSummary,
  resolveAssetAnalyticsConfig,
} from '#lib/api/services/analytics.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getAssetAnalyticsSummary
// - getPlatformAnalyticsSummary

const assetAnalyticsSummaryParamsSchema = z.object({
  scopePrefixes: z.array(z.string()).optional(),
  organisationIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
    })
    .optional(),
})

/**
 * Loads the asset analytics summary for admin-only monitoring surfaces.
 *
 * @param _params - Remote query metadata envelope.
 * @param ctx - Guarded remote context with server auth and platform env access.
 * @returns A normalized analytics summary result.
 */
export const getAssetAnalyticsSummary = guardedQuery(
  assetAnalyticsSummaryParamsSchema,
  async (params, ctx) => {
    if (ctx.user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    if (
      !ctx.isAdminRequest ||
      !canAccessAnalytics({
        superAdmin: ctx.user.superAdmin,
        userRoles: ctx.userRoles,
      })
    ) {
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }

    const scope = await resolveAnalyticsScope({
      db: ctx.db,
      user: ctx.user,
      userRoles: ctx.userRoles,
      requestedScope: {
        scopePrefixes: params.scopePrefixes ?? [],
        organisationIds: params.organisationIds ?? [],
        projectIds: params.projectIds ?? [],
      },
    })
    if (!scope.allowed || !scope.scope) {
      throw error(403, toAuthMessage(scope.code ?? 'INSUFFICIENT_ROLE'))
    }

    return fetchAssetAnalyticsSummary({
      ...resolveAssetAnalyticsConfig({
        environment: ctx.event.locals.platform?.env.ENVIRONMENT,
        baseUrl: ctx.event.locals.platform?.env.PUBLIC_ASSET_BASE_URL,
        readToken: ctx.event.locals.platform?.env.ASSET_ANALYTICS_READ_TOKEN,
        privateReadToken: ctx.event.locals.platform?.env.ASSET_ANALYTICS_READ_TOKEN,
        legacyPrivateReadToken:
          ctx.event.locals.platform?.env.IMAGE_ANALYTICS_READ_TOKEN,
      }),
      scopePrefixes: scope.scope.scopePrefixes,
      organisationIds: scope.scope.organisationIds,
      projectIds: scope.scope.projectIds,
    })
  },
)

/**
 * Reads host-scoped traffic or global operational analytics.
 * @param params - Facet, optional authorized hostname, and explicit admin intent.
 * @param ctx - Guarded identity, database, and server credentials.
 * @returns A normalized snapshot for the selected dashboard.
 * @remarks Shared infrastructure is restricted to global administrators. Hub admins
 * can read only their own persisted custom domains; prisms do not attribute traffic.
 */
export const getPlatformAnalyticsSummary = guardedQuery(
  z.object({
    facet: z.enum(['views', 'audience', 'data']),
    hostname: z.string().max(253).optional(),
    meta: z.object({ isAdminRequest: FormBoolean.optional() }).optional(),
  }),
  async (params, ctx) => {
    if (
      ctx.user.isAnonymous ||
      !ctx.isAdminRequest ||
      !canAccessAnalytics({ superAdmin: ctx.user.superAdmin, userRoles: ctx.userRoles })
    ) {
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }
    const globalAdmin = ctx.user.superAdmin || isCoreHubAdmin(ctx.userRoles)
    if (params.facet === 'data' && !globalAdmin) {
      return {
        status: 'error' as const,
        message: 'Shared infrastructure analytics requires a global administrator.',
      }
    }
    let hosts: string[] = []
    let hostname = ''
    if (params.facet !== 'data') {
      const allowedHubIds = getScopedHubAdminIds(ctx.userRoles)
      // Resolve host ownership from persisted hubs, never from client-supplied prisms.
      const hubs = await ctx.db.select({ id: hub.id, domain: hub.domain }).from(hub)
      hosts = [
        ...new Set(
          hubs
            .filter(row => globalAdmin || allowedHubIds.has(row.id))
            .map(row => row.domain?.trim().toLowerCase())
            .filter(
              (domain): domain is string =>
                Boolean(domain) &&
                !/localhost|\.localhost$|^preview\./.test(domain ?? ''),
            ),
        ),
      ].sort()
      // Prefer the active hub's production domain while retaining authorized scope.
      const hubDomain = hubs
        .find(row => row.id === ctx.event.locals.hub?.id)
        ?.domain?.trim()
        .toLowerCase()
      const defaultHostname =
        hubDomain && hosts.includes(hubDomain)
          ? hubDomain
          : hosts.includes('hype.hk')
            ? 'hype.hk'
            : hosts[0] || ''
      hostname = params.hostname || defaultHostname
      if (params.hostname && !hosts.includes(hostname))
        throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }
    const env = ctx.event.locals.platform?.env
    return fetchPlatformAnalytics({
      facet: params.facet,
      hostname,
      hosts,
      accountId: env?.CLOUDFLARE_ACCOUNT_ID,
      token: env?.CLOUDFLARE_ANALYTICS_API_TOKEN,
      databaseId: env?.ANALYTICS_DATABASE_ID,
      queueIds: env?.ANALYTICS_QUEUE_IDS?.split(',')
        .map(id => id.trim())
        .filter(Boolean),
    })
  },
)
