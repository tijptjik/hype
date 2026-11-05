// DOMAIN
import { productUsageSchema } from './productUsage.js'
// TYPES
import type { ProductUsage, ContributionEvent } from './productUsage.js'
import type { AnalyticsEngineDataset } from '@cloudflare/workers-types'

/**
 * Writes one versioned, privacy-minimised event to Analytics Engine.
 * @param dataset Worker binding, absent outside production.
 * @param environment Server-owned deployment environment; only production may write.
 * @param input Validated event dimensions.
 * @returns Nothing.
 * @remarks Telemetry failures never invalidate a completed interaction or database write.
 */
export function recordProductUsage(
  dataset: AnalyticsEngineDataset | undefined,
  input: ProductUsage,
  environment?: string,
): void {
  if (environment !== 'production' || !dataset) return
  const parsed = productUsageSchema.safeParse(input)
  if (!parsed.success) return
  const event = parsed.data
  try {
    dataset.writeDataPoint({
      indexes: [event.event],
      blobs: ['v1', event.event, event.source, event.hubId ?? '', event.entityId],
      doubles: [1],
    })
  } catch {
    console.warn('[product-usage] Analytics Engine write failed')
  }
}

/**
 * Records a committed contribution using the server-resolved hub.
 * @param locals Request-local binding and hub context.
 * @param event Contribution category.
 * @param entityId Saved feature ID or submitted task ID.
 * @returns Nothing.
 * @remarks Call after persistence, never on draft creation, retries or task review.
 */
export function recordContribution(
  locals: Pick<App.Locals, 'platform' | 'hub'>,
  event: ContributionEvent,
  entityId: string,
): void {
  recordProductUsage(
    locals.platform?.env.PRODUCT_USAGE,
    {
      event,
      entityId,
      hubId: locals.hub?.id,
      source: 'server',
    },
    locals.platform?.env.ENVIRONMENT,
  )
}

/**
 * Records the first successful submission of a contribution task.
 * @param locals Request-local context.
 * @param task Persisted submitted task.
 * @returns Nothing for unsupported task categories.
 */
export function recordTaskContribution(
  locals: Pick<App.Locals, 'platform' | 'hub'>,
  task: { id: string; type: string },
): void {
  const event =
    task.type === 'newFeature'
      ? 'contribution.new_feature'
      : task.type === 'reportedMissing'
        ? 'contribution.missing_report'
        : task.type === 'newPhoto'
          ? 'contribution.photos'
          : null
  if (event) recordContribution(locals, event, task.id)
}
