// VALIDATION
import { z } from 'zod'
// I18N
import { m } from '#lib/i18n.js'

export const LOCATION_TASK_TYPES = [
  'locationFacts',
  'locationPosition',
  'locationIdentity',
  'locationMerge',
] as const
export const LocationTaskSchema = z.object({
  kind: z.enum(['facts', 'position', 'identity', 'merge']),
  locationId: z.string(),
  locationKind: z
    .enum(['unknown', 'establishment', 'building', 'premises', 'address', 'natural'])
    .optional(),
  names: z.record(z.string(), z.string()).optional(),
  correctionProposalId: z.string().optional(),
  proposalId: z.string().optional(),
  reviewId: z.string().optional(),
  mergeReviewId: z.string().nullish(),
  rematchJobId: z.string().optional(),
  rematchStatus: z.string().optional(),
  rematchReason: z.string().nullish(),
  mock: z.boolean().optional(),
})

/** Recognize source-derived task identities before selecting their read adapter.
 * @param id Queue identity. @returns Whether it names a Location review or explicit development fixture.
 */
export function isLocationTaskId(id: string): boolean {
  return LOCATION_TASK_TYPES.some(
    type =>
      id.startsWith(`${type}:`) ||
      (import.meta.env.DEV && id.startsWith(`mock:${type}:`)),
  )
}

/** Resolve the same localized Location task label in the queue, editor and filters.
 * @param type Queue task type. @returns Localized label, or an empty string for a contribution task.
 */
export function locationTaskLabel(type: string): string {
  return (
    (
      {
        locationFacts: m.location_task_facts(),
        locationPosition: m.location_task_position(),
        locationIdentity: m.location_task_identity(),
        locationMerge: m.location_task_merge(),
      } as Record<string, string>
    )[type] ?? ''
  )
}
