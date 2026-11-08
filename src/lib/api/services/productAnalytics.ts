// THIRD PARTY
import { z } from 'zod'
// DOMAIN
import {
  CLIENT_USAGE_EVENTS,
  CONTRIBUTION_EVENTS,
} from '#lib/analytics/productUsage.js'

// TYPES
import type { AnalyticsResources } from './analyticsScope'

// +++ Table Of Contents
// 1. QUERY CONTRACT — buildProductAnalyticsQuery
// 2. FETCH AND NORMALIZATION — fetchProductAnalytics
// ---

const rowSchema = z.object({
  event: z.enum([...CLIENT_USAGE_EVENTS, ...CONTRIBUTION_EVENTS]),
  entityId: z.string().optional(),
  count: z.coerce.number().finite().nonnegative(),
})
export type ProductAnalyticsRow = z.infer<typeof rowSchema>
export type ProductAnalyticsResult =
  | {
      status: 'success'
      totals: ProductAnalyticsRow[]
      rankings: ProductAnalyticsRow[]
      environment: string
      scope?: string
    }
  | { status: 'unconfigured' | 'error'; message: string }

/**
 * Builds a fixed 30-day, sampling-correct query for product usage.
 * @param dataset Production dataset identifier; non-production datasets are rejected.
 * @param ranking Whether to group by resource as well as event.
 * @param scope Authorized scope resolved from persisted resource ownership.
 * @returns SQL with no caller-provided fragments.
 */
export function buildProductAnalyticsQuery(
  dataset: string,
  ranking: boolean,
  scope?: AnalyticsResources,
): string {
  if (dataset !== 'hype_product_usage_production')
    throw new Error('Invalid product usage dataset')
  const filter = buildProductScopeFilter(scope)
  return `SELECT blob2 AS event${ranking ? ', blob5 AS entityId' : ''},
    SUM(_sample_interval * double1) AS count
    FROM ${dataset}
    WHERE blob1 = 'v1'${filter} AND timestamp >= NOW() - INTERVAL '30' DAY
    GROUP BY blob2${ranking ? ', blob5' : ''}
    ORDER BY count DESC LIMIT ${ranking ? 100 : 20} FORMAT JSON`
}

/** Builds event-specific predicates so IDs from different resource types cannot cross scopes.
 * @param scope Server-authorized resource IDs. @returns A bounded SQL predicate.
 * @remarks Empty resource lists match nothing; values are validated before interpolation.
 */
function buildProductScopeFilter(scope?: AnalyticsResources): string {
  if (!scope) return ''
  const list = (ids: string[]): string =>
    ids
      .map(id => {
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
          throw new Error('Invalid analytics identifier')
        return `'${id}'`
      })
      .join(',')
  if (scope.hubIds)
    return scope.hubIds.length ? ` AND blob4 IN (${list(scope.hubIds)})` : ' AND 1 = 0'
  if (!scope.entities) return ''
  const e = scope.entities
  const clauses = [
    ["blob2 = 'organisation.click'", e.organisations],
    ["blob2 = 'project.filter'", e.projects],
    ["blob2 = 'layer.activate'", e.layers],
    ["blob2 IN ('feature.view','contribution.edit')", e.features],
    ["blob2 = 'contribution.new_feature'", [...e.features, ...e.tasks]],
    ["blob2 IN ('contribution.missing_report','contribution.photos')", e.tasks],
  ] as const
  const filter = clauses
    .filter(([, ids]) => ids.length)
    .map(([event, ids]) => `(${event} AND blob5 IN (${list([...new Set(ids)])}))`)
    .join(' OR ')
  if (filter.length > 80000) throw new RangeError('Analytics scope exceeds query size')
  return filter ? ` AND (${filter})` : ' AND 1 = 0'
}

/**
 * Reads event totals and resource rankings independently of the operational dataset.
 * @param env Server-only deployment config and Analytics Engine read credential.
 * @param fetcher Request transport, injectable for tests.
 * @param scope Authorized resource IDs or hub attribution.
 * @returns A snapshot or explicit unconfigured/error state; failures never become zeros.
 * @remarks Retained events are sampled estimates, not unique people or an audit ledger.
 */
export async function fetchProductAnalytics(
  env: Pick<
    App.Platform['env'],
    | 'PRODUCT_USAGE_DATASET'
    | 'PRODUCT_USAGE_READ_TOKEN'
    | 'CLOUDFLARE_ACCOUNT_ID'
    | 'ENVIRONMENT'
  >,
  fetcher: typeof fetch = fetch,
  scope?: AnalyticsResources,
): Promise<ProductAnalyticsResult> {
  const dataset = env.PRODUCT_USAGE_DATASET
  const token = env.PRODUCT_USAGE_READ_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (!dataset || !token || !accountId)
    return {
      status: 'unconfigured',
      message:
        'Product analytics requires its dataset, account ID and Analytics Engine read token.',
    }
  if (!/^[a-f0-9]{32}$/.test(accountId))
    return { status: 'error', message: 'Invalid analytics account configuration.' }
  try {
    // Totals must not be calculated from a truncated resource ranking.
    const [totals, rankings] = await Promise.all(
      [false, true].map(async ranking => {
        const response = await fetcher(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
            body: buildProductAnalyticsQuery(dataset, ranking, scope),
            signal: AbortSignal.timeout(15_000),
          },
        )
        if (!response.ok)
          throw new Error(`Analytics Engine returned HTTP ${response.status}`)
        return z.object({ data: z.array(rowSchema) }).parse(await response.json()).data
      }),
    )
    return {
      status: 'success',
      totals,
      rankings,
      environment: 'production',
      scope: scope?.label ?? 'Global',
    }
  } catch (cause) {
    if (cause instanceof RangeError)
      return {
        status: 'error',
        message: 'This scope is too large for a usage query. Select a smaller project.',
      }
    return {
      status: 'error',
      message:
        'Product analytics could not be loaded. Check the Analytics Engine read token and dataset availability.',
    }
  }
}
