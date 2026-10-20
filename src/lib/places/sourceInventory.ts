// VALIDATION
import { z } from 'zod'
// TYPES
import type { PlaceSourceClient } from './sourceClient'

const id = z.string().min(1).max(200)
const inventorySchema = z.object({
  sourceReleases: z
    .array(
      z
        .object({
          apiReleaseSetCode: id,
          datasetCode: id,
          resourceType: id,
          sourceVariant: id,
          sourceReleaseCode: id,
          snapshotCode: id,
          role: id,
          recordsAvailable: z.boolean(),
        })
        .passthrough(),
    )
    .max(500),
})
export type PlaceSourceInventory = z.infer<typeof inventorySchema>['sourceReleases']
export type PlaceSourceComparisonPlan = {
  reviewRequired: boolean
  comparisons: Array<{
    datasetCode: string
    resourceType: string
    sourceVariant: string
    fromRelease: string
    toRelease: string
  }>
  outcomes: Array<{
    datasetCode: string
    resourceType: string
    reason:
      | 'baseline'
      | 'unchanged'
      | 'unavailable'
      | 'ambiguous'
      | 'added-dataset'
      | 'removed-dataset'
  }>
}

/**
 * Discover publisher releases contributing to one named canonical release set.
 * @param client Trusted source transport.
 * @param releaseSet Canonical publication release-set code.
 * @returns Bounded inventory, retained separately from canonical publication evidence.
 * @remarks This endpoint does not support catalogue pins. Retain its actual response;
 * never claim it proves canonical revisions or use its response URLs as fetch targets.
 */
export async function readPlaceSourceInventory(
  client: PlaceSourceClient,
  releaseSet: string,
): Promise<PlaceSourceInventory> {
  id.parse(releaseSet)
  const url = new URL('/places/v0.1/source-releases', client.baseUrl)
  url.search = new URLSearchParams({ releaseSet, region: 'hk' }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`Place source inventory failed (${response.status})`)
  const inventory = inventorySchema.parse(await response.json()).sourceReleases
  if (inventory.some(row => row.apiReleaseSetCode !== releaseSet))
    throw new Error('Place source inventory release-set mismatch')
  return inventory
}

/**
 * Pair unambiguous publisher releases without conflating source IDs and canonical Places.
 * @param before Prior inventory, or null for initial discovery.
 * @param after Target inventory.
 * @returns Comparisons plus explicit baseline, unchanged and review outcomes.
 * @remarks Dependencies of other resource types are not Places source changes. Duplicate
 * roles/snapshots collapse only when their release identity and availability agree.
 */
export function planPlaceSourceComparisons(
  before: PlaceSourceInventory | null,
  after: PlaceSourceInventory,
): PlaceSourceComparisonPlan {
  const plan: PlaceSourceComparisonPlan = {
    comparisons: [],
    outcomes: [],
    reviewRequired: false,
  }
  const datasets = new Set(
    [...(before ?? []), ...after]
      .filter(row => row.resourceType === 'place')
      .map(row => row.datasetCode),
  )
  for (const datasetCode of [...datasets].sort()) {
    const unique = (rows: PlaceSourceInventory) => [
      ...new Map(
        rows
          .filter(
            row => row.datasetCode === datasetCode && row.resourceType === 'place',
          )
          .map(row => [
            JSON.stringify([
              row.sourceReleaseCode,
              row.sourceVariant,
              row.recordsAvailable,
            ]),
            row,
          ]),
      ).values(),
    ]
    const old = unique(before ?? []),
      next = unique(after)
    const outcome = (reason: PlaceSourceComparisonPlan['outcomes'][number]['reason']) =>
      plan.outcomes.push({ datasetCode, resourceType: 'place', reason })
    if (
      old.length > 1 ||
      next.length > 1 ||
      (old[0] && next[0] && old[0].sourceVariant !== next[0].sourceVariant)
    )
      outcome('ambiguous')
    else if (before === null)
      outcome(next[0]?.recordsAvailable ? 'baseline' : 'unavailable')
    else if (!old.length) outcome('added-dataset')
    else if (!next.length) outcome('removed-dataset')
    else if (!old[0].recordsAvailable || !next[0].recordsAvailable)
      outcome('unavailable')
    else if (old[0].sourceReleaseCode === next[0].sourceReleaseCode)
      outcome('unchanged')
    else
      plan.comparisons.push({
        datasetCode,
        resourceType: 'place',
        sourceVariant: next[0].sourceVariant,
        fromRelease: old[0].sourceReleaseCode,
        toRelease: next[0].sourceReleaseCode,
      })
  }
  plan.reviewRequired =
    after.every(row => row.resourceType !== 'place') ||
    plan.outcomes.some(row => row.reason !== 'baseline' && row.reason !== 'unchanged')
  return plan
}
