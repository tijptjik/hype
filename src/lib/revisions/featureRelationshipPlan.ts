// VALIDATION
import { z } from 'zod'

export const FeatureTaskAssignmentsSchema = z
  .array(
    z.object({
      taskId: z.string().min(1),
      featureId: z.string().min(1),
    }),
  )
  .max(10000)
export type FeatureTaskAssignment = z.infer<typeof FeatureTaskAssignmentsSchema>[number]
export type IdentityTaskEvidence = {
  id: string
  featureId: string
  isReviewed: number
  isDraft: number
  modifiedAt: string
  type: string
  contributorId: string
}

/**
 * Requires exactly one reviewed output for every open task, including retained identities.
 * @param tasks Immutable task snapshot shown to the reviewer.
 * @param outputs Resulting Feature identities.
 * @param assignments Explicit reviewer choices (the UI supplies merge defaults).
 * @returns Assignments paired with their original task evidence.
 */
export function resolveFeatureTaskAssignments(
  tasks: IdentityTaskEvidence[],
  outputs: readonly string[],
  assignments: FeatureTaskAssignment[],
): {
  task: IdentityTaskEvidence
  featureId: string
}[] {
  const open = tasks.filter(task => !task.isReviewed)
  const selected = new Map(assignments.map(value => [value.taskId, value.featureId]))
  if (
    selected.size !== assignments.length ||
    selected.size !== open.length ||
    open.some(
      task => !selected.has(task.id) || !outputs.includes(selected.get(task.id)!),
    )
  )
    throw new Error('Assign every open task exactly once to a resulting Feature')
  return open.map(task => ({ task, featureId: selected.get(task.id)! }))
}
