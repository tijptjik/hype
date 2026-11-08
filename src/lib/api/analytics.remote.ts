// SVELTE
import { error } from '@sveltejs/kit'
// THIRD PARTY
import { z } from 'zod'
// DB
import { hub, organisation } from '#lib/db/schema/index.js'
import { FormBoolean } from '#lib/db/zod/form.js'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// SCOPING
import {
  analyticsHostsForScope,
  listAnalyticsScopes,
  resolveAnalyticsResources,
} from '#lib/api/services/analyticsScope.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
// AUTHORIZATION
import { isCoreHubAdmin } from '#lib/api/services/authz/hub.js'
import { resolveAnalyticsScope, toAuthMessage } from '#lib/api/services/authz/index.js'
import { canAccessAnalytics } from '#lib/api/services/authz/user.js'
// SERVER
import { fetchProductAnalytics } from '#lib/api/services/productAnalytics.js'
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
// - getProductAnalyticsSummary

const analyticsSelectionSchema = z.object({
  type: z.enum(['global', 'hub', 'organisation', 'project']),
  id: z.string().min(1).max(64).optional(),
})

/** Lists authorized analytics perspectives and infrastructure tabs.
 * @param params Admin intent and cache identity. @param ctx Fresh guarded session.
 * @returns Authorized scope options and available infrastructure facets.
 */
export const getAnalyticsScopes = guardedQuery(
  z.object({
    meta: z
      .object({ isAdminRequest: FormBoolean.optional(), scope: z.string().optional() })
      .optional(),
  }),
  async (_params, ctx) => {
    if (
      ctx.user.isAnonymous ||
      !ctx.isAdminRequest ||
      !canAccessAnalytics({ superAdmin: ctx.user.superAdmin, userRoles: ctx.userRoles })
    )
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    return {
      options: await listAnalyticsScopes({
        db: ctx.db,
        user: ctx.user,
        userRoles: ctx.userRoles,
      }),
      assets: Boolean(
        ctx.user.superAdmin ||
          ctx.userRoles.some(role => role.type === 'hub' && role.role === 'admin'),
      ),
      data: Boolean(ctx.user.superAdmin || isCoreHubAdmin(ctx.userRoles)),
    }
  },
)

const assetAnalyticsSummaryParamsSchema = z.object({
  selection: analyticsSelectionSchema.optional(),
  scopePrefixes: z.array(z.string()).optional(),
  organisationIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  meta: z
    .object({
      isAdminRequest: FormBoolean.optional(),
      // Client cache identity only; authorization always uses guarded server context.
      scope: z.string().optional(),
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

    if (
      !(
        ctx.user.superAdmin ||
        ctx.userRoles.some(role => role.type === 'hub' && role.role === 'admin')
      )
    )
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    let organisationIds = params.organisationIds ?? []
    let projectIds = params.projectIds ?? []
    if (params.selection) {
      const options = await listAnalyticsScopes({
        db: ctx.db,
        user: ctx.user,
        userRoles: ctx.userRoles,
      })
      if (
        !options.some(
          option =>
            option.type === params.selection?.type &&
            option.id === params.selection?.id,
        )
      )
        throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
      organisationIds =
        params.selection.type === 'organisation' ? [params.selection.id!] : []
      projectIds = params.selection.type === 'project' ? [params.selection.id!] : []
      if (params.selection.type === 'hub') {
        const rows = await ctx.db
          .select({ id: organisation.id })
          .from(organisation)
          .where(chunkedInArray(organisation.hubId, [params.selection.id!]))
        organisationIds = rows.map(row => row.id)
        if (!organisationIds.length)
          return {
            status: 'error' as const,
            message: 'This hub has no organisation assets.',
          }
      }
    }

    const scope = await resolveAnalyticsScope({
      db: ctx.db,
      user: ctx.user,
      userRoles: ctx.userRoles,
      requestedScope: {
        scopePrefixes: params.scopePrefixes ?? [],
        organisationIds,
        projectIds,
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
 * read their own persisted domains; delegated readers receive exact resource-path filters.
 */
export const getPlatformAnalyticsSummary = guardedQuery(
  z.object({
    facet: z.enum(['views', 'audience', 'data']),
    selection: analyticsSelectionSchema.optional(),
    hostname: z.string().max(253).optional(),
    meta: z
      .object({ isAdminRequest: FormBoolean.optional(), scope: z.string().optional() })
      .optional(),
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
    const resources = await resolveAnalyticsResources(
      { db: ctx.db, user: ctx.user, userRoles: ctx.userRoles },
      params.selection,
    )
    if (!resources) throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    let hosts: string[] = []
    let hostname = ''
    if (params.facet !== 'data') {
      // Resolve host membership server-side and retain exact resource-path filters.
      const hubs = await ctx.db
        .select({ id: hub.id, code: hub.code, domain: hub.domain })
        .from(hub)
      hosts = analyticsHostsForScope(hubs, resources)
      const hubDomain = hubs
        .find(row => row.id === ctx.event.locals.hub?.id)
        ?.domain?.trim()
        .toLowerCase()
      if (hosts.length > 1) hosts.unshift('*')
      hostname =
        params.hostname ||
        (hosts.includes('*') ? '*' : '') ||
        (hubDomain && hosts.includes(hubDomain)
          ? hubDomain
          : hosts.includes('hype.hk')
            ? 'hype.hk'
            : hosts[0] || '')
      if (params.hostname && !hosts.includes(hostname))
        throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    }
    const env = ctx.event.locals.platform?.env
    return fetchPlatformAnalytics({
      facet: params.facet,
      paths: resources.paths,
      scopeLabel: resources.label,
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

/**
 * Reads authorized product interactions and contribution totals from production in every deployment.
 * @param params Explicit admin intent and cache identity.
 * @param ctx Verified identity and request-local bindings.
 * @returns A sampling-weighted 30-day snapshot.
 * @remarks Filtering precedes aggregation; resource selection never grants authority.
 */
export const getProductAnalyticsSummary = guardedQuery(
  z.object({
    selection: analyticsSelectionSchema.optional(),
    meta: z
      .object({ isAdminRequest: FormBoolean.optional(), scope: z.string().optional() })
      .optional(),
  }),
  async (params, ctx) => {
    if (
      ctx.user.isAnonymous ||
      !ctx.isAdminRequest ||
      !canAccessAnalytics({ superAdmin: ctx.user.superAdmin, userRoles: ctx.userRoles })
    )
      throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    const resources = await resolveAnalyticsResources(
      { db: ctx.db, user: ctx.user, userRoles: ctx.userRoles },
      params.selection,
    )
    if (!resources) throw error(403, toAuthMessage('INSUFFICIENT_ROLE'))
    return fetchProductAnalytics(ctx.event.locals.platform.env, fetch, resources)
  },
)
