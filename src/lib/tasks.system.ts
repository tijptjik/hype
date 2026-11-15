// VALIDATION
import { z } from 'zod'

export const taskResourceSchema = z.enum([
  'feature',
  'location',
  'system',
  'premisesMap',
])
export type TaskResource = z.infer<typeof taskResourceSchema>
export type SystemTask = {
  id: string
  resource: 'location' | 'premisesMap'
  resourceId: string
  type: string
  title: string
  message: string
  isReviewed: boolean
  reviewOutcome: 'accepted' | 'rejected' | null
  reviewerId: string | null
  createdAt: string
  modifiedAt: string
}

/** Identify resource filters that have no Feature ancestry.
 * @param resource Selected queue resource. @returns Whether only system rows are requested.
 */
export function systemTasksOnly(resource?: TaskResource | null): boolean {
  return resource === 'system' || resource === 'premisesMap'
}
