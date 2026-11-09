// VALIDATION
import { z } from 'zod'
// TYPES
import type { LocationKind } from './kinds'

import {
  OPERATING_STATUSES,
  BUILDING_STATUSES,
  OperatingStatusSchema,
  BuildingStatusSchema,
} from './entityStatus'
import type { OperatingStatus, BuildingStatus } from './entityStatus'
/** SaanSeoi/Overture operating vocabulary; absence means unknown, never open. */
export { OPERATING_STATUSES, OperatingStatusSchema } from './entityStatus'
export type { OperatingStatus } from './entityStatus'
/** Physical buildings have no business operating status. */
export { BUILDING_STATUSES, BuildingStatusSchema } from './entityStatus'
export type { BuildingStatus } from './entityStatus'
export const LIFECYCLE_STATUSES = [
  'unknown',
  ...OPERATING_STATUSES,
  ...BUILDING_STATUSES,
] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

/** Read the source vocabulary without interpreting missing inventory as closure.
 * @param value Source operatingStatus, retained unchanged in the raw source rawSource.
 * @returns Supported operatingStatus, or undefined for unknown/missing values.
 */
export function mapOperatingStatus(value: unknown): OperatingStatus | undefined {
  const result = OperatingStatusSchema.safeParse(value)
  return result.success ? result.data : undefined
}

/** Validate status against the actual entity type without modifying Feature subject flags.
 * @param kind Persisted Location kind (or its authorized replacement).
 * @param facts Proposed lightweight status fields.
 * @returns Nothing; throws when a status belongs to another kind.
 */
export function validateLocationStatusKind(
  kind: LocationKind,
  facts: {
    operatingStatus?: OperatingStatus | null
    buildingStatus?: BuildingStatus | null
  },
): void {
  if (facts.operatingStatus != null) OperatingStatusSchema.parse(facts.operatingStatus)
  if (facts.buildingStatus != null) BuildingStatusSchema.parse(facts.buildingStatus)
  if (facts.operatingStatus != null && kind !== 'establishment')
    throw new Error('Operating status must match establishment kind')
  if (facts.buildingStatus != null && kind !== 'building')
    throw new Error('Building status must match building kind')
}

/** Public reads expose accepted status only; no separate assertion/evidence system is stored. */
export const LocationLifecycleSummarySchema = z.strictObject({
  operatingStatus: OperatingStatusSchema.nullish(),
  buildingStatus: BuildingStatusSchema.nullish(),
})
export type LocationLifecycleSummary = z.infer<typeof LocationLifecycleSummarySchema>

/** Read missing status as unknown without equating it with open or standing.
 * @param facts Accepted lightweight Location status.
 * @returns Explicit status for displays/filters.
 */
export function lifecycleStatus(
  facts?: LocationLifecycleSummary | null,
): LifecycleStatus {
  return facts?.operatingStatus ?? facts?.buildingStatus ?? 'unknown'
}

/** Return lifecycle choices applicable to a directory kind filter.
 * @param kind Selected kind, or empty for all kinds.
 * @returns Unknown plus the kind's supported lifecycle vocabulary.
 * @remarks Premises, addresses and natural features currently have no lifecycle vocabulary.
 */
export function lifecycleStatusesForKind(
  kind: LocationKind | '',
): readonly LifecycleStatus[] {
  if (!kind) return LIFECYCLE_STATUSES
  if (kind === 'establishment') return ['unknown', ...OPERATING_STATUSES]
  if (kind === 'building') return ['unknown', ...BUILDING_STATUSES]
  return ['unknown']
}
